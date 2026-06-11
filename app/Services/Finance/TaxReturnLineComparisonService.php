<?php

namespace App\Services\Finance;

use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;

/**
 * Local-only CPA return line comparison (epic #976 lane 3E).
 *
 * The agent extracts {form, line, amount_cents} rows from a CPA-prepared
 * return locally; the server compares them transiently against the tax
 * preview's TaxFactSource totals for the year. Pure computation: no file is
 * uploaded, no FileForTaxDocument/FinDocument rows are created, nothing is
 * mutated. All arithmetic is integer cents (dollar floats from the facts
 * payload are converted to cents once, at the boundary).
 *
 * Canonical comparison keys are the TaxFactRouting enum string values
 * (e.g. form_1040_line_1z, schedule_d_line_16). Inputs that cannot be
 * normalized to a known routing are reported as unmatched_input, never as an
 * error.
 */
class TaxReturnLineComparisonService
{
    public function __construct(private readonly TaxPreviewDataService $taxPreviewDataService) {}

    /**
     * Compare submitted return lines against the user's tax preview facts.
     *
     * @param  list<array{form?: string, line?: string, label?: string|null, amount_cents?: int}>  $lines
     * @return array<string, mixed>
     */
    public function compareForUser(int $userId, int $year, array $lines, int $toleranceCents = 0, ?string $returnType = null): array
    {
        $dataset = $this->taxPreviewDataService->datasetForYear($userId, $year, true);
        $taxFacts = is_array($dataset['taxFacts'] ?? null) ? $dataset['taxFacts'] : [];

        return $this->compare($year, $this->routingTotalsCents($taxFacts), $lines, $toleranceCents, $returnType);
    }

    /**
     * Build `routing => summed amount_cents` from a tax facts payload
     * (TaxPreviewFacts::toArray() shape). TaxFactSource entries are detected
     * structurally anywhere in the tree; sources re-listed under multiple
     * fact collections (e.g. Schedule 1 sources echoed into Form 1040 line 8)
     * are counted once per (routing, source id) pair.
     *
     * @param  array<string, mixed>  $taxFacts
     * @return array<string, int>
     */
    public function routingTotalsCents(array $taxFacts): array
    {
        $totals = [];
        $seen = [];
        $this->collectSourceTotals($taxFacts, $totals, $seen);
        ksort($totals);

        return $totals;
    }

    /**
     * Compare submitted lines against precomputed preview routing totals.
     *
     * @param  array<string, int>  $previewTotalsCents
     * @param  list<array{form?: string, line?: string, label?: string|null, amount_cents?: int}>  $lines
     * @return array<string, mixed>
     */
    public function compare(int $year, array $previewTotalsCents, array $lines, int $toleranceCents = 0, ?string $returnType = null): array
    {
        $toleranceCents = max(0, $toleranceCents);
        $summary = [
            'matched' => 0,
            'different' => 0,
            'missing_in_preview' => 0,
            'missing_in_return' => 0,
            'unmatched_input' => 0,
        ];
        $discrepancies = [];
        $unmatchedInputs = [];
        $submittedKeys = [];

        foreach ($lines as $line) {
            $form = trim((string) ($line['form'] ?? ''));
            $lineId = trim((string) ($line['line'] ?? ''));
            $label = isset($line['label']) ? (string) $line['label'] : null;
            $returnAmountCents = (int) ($line['amount_cents'] ?? 0);

            $key = $this->normalizeKey($form, $lineId);

            if ($key === null) {
                $summary['unmatched_input']++;
                $unmatchedInputs[] = ['form' => $form, 'line' => $lineId, 'label' => $label];

                continue;
            }

            $submittedKeys[$key] = true;

            if (! array_key_exists($key, $previewTotalsCents)) {
                $summary['missing_in_preview']++;
                $discrepancies[] = [
                    'key' => $key,
                    'form' => $form,
                    'line' => $lineId,
                    'status' => 'missing_in_preview',
                    'return_amount_cents' => $returnAmountCents,
                    'preview_amount_cents' => null,
                    'delta_cents' => $returnAmountCents,
                    'severity' => 'review',
                ];

                continue;
            }

            $previewAmountCents = $previewTotalsCents[$key];
            $deltaCents = $returnAmountCents - $previewAmountCents;

            if (abs($deltaCents) <= $toleranceCents) {
                $summary['matched']++;

                continue;
            }

            $summary['different']++;
            $discrepancies[] = [
                'key' => $key,
                'form' => $form,
                'line' => $lineId,
                'status' => 'different',
                'return_amount_cents' => $returnAmountCents,
                'preview_amount_cents' => $previewAmountCents,
                'delta_cents' => $deltaCents,
                'severity' => 'review',
            ];
        }

        foreach ($previewTotalsCents as $key => $cents) {
            if ($cents !== 0 && ! isset($submittedKeys[$key])) {
                $summary['missing_in_return']++;
            }
        }

        return [
            'year' => $year,
            'return_type' => $returnType,
            'tolerance_cents' => $toleranceCents,
            'summary' => $summary,
            'discrepancies' => $discrepancies,
            'unmatched_inputs' => $unmatchedInputs,
        ];
    }

    /**
     * Normalize a {form, line} pair to a canonical TaxFactRouting string
     * value, or null when no known routing matches.
     */
    public function normalizeKey(string $form, string $line): ?string
    {
        $formId = $this->normalizeFormId($form);
        $lineId = $this->normalizeLineId($line);

        if ($formId === null || $lineId === '') {
            return null;
        }

        $candidates = [
            "{$formId}_line_{$lineId}",
            "{$formId}_{$lineId}",
        ];

        if ($formId === 'schedule_1') {
            $candidates[] = "sch_1_{$lineId}";
            $candidates[] = "sch_1_line_{$lineId}";
        }

        foreach ($candidates as $candidate) {
            if (TaxFactRouting::tryFrom($candidate) !== null) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Map a form label to a snake form id: "1040" → form_1040,
     * "Schedule D"/"Sch D" → schedule_d, "Form 8949"/"8949" → form_8949.
     */
    private function normalizeFormId(string $form): ?string
    {
        $value = strtolower(trim($form));
        $value = (string) preg_replace('/[.\s]+/', ' ', $value);

        if ($value === '') {
            return null;
        }

        if (preg_match('/^(?:schedule|sch)\s*([0-9a-z]+)$/', $value, $matches) === 1) {
            return 'schedule_'.$matches[1];
        }

        if (preg_match('/^(?:form\s*)?([0-9]{3,5}[a-z]*)$/', $value, $matches) === 1) {
            return 'form_'.$matches[1];
        }

        $snake = trim((string) preg_replace('/[^a-z0-9]+/', '_', $value), '_');

        return $snake === '' ? null : $snake;
    }

    private function normalizeLineId(string $line): string
    {
        $value = strtolower(trim($line));
        $value = (string) preg_replace('/^line\s*/', '', $value);

        return trim((string) preg_replace('/[^a-z0-9]+/', '_', $value), '_');
    }

    /**
     * @param  array<array-key, mixed>  $node
     * @param  array<string, int>  $totals
     * @param  array<string, true>  $seen
     */
    private function collectSourceTotals(array $node, array &$totals, array &$seen): void
    {
        if ($this->isTaxFactSource($node)) {
            $routing = $node['routing'];

            if (is_string($routing) && $routing !== '') {
                $dedupeKey = $routing.'|'.(string) $node['id'];

                if (! isset($seen[$dedupeKey])) {
                    $seen[$dedupeKey] = true;
                    $totals[$routing] = ($totals[$routing] ?? 0) + $this->dollarsToCents($node['amount']);
                }
            }

            return;
        }

        foreach ($node as $child) {
            if (is_array($child)) {
                $this->collectSourceTotals($child, $totals, $seen);
            }
        }
    }

    /**
     * @param  array<array-key, mixed>  $node
     */
    private function isTaxFactSource(array $node): bool
    {
        return array_key_exists('routing', $node)
            && array_key_exists('amount', $node)
            && isset($node['id'], $node['sourceType'])
            && is_numeric($node['amount']);
    }

    private function dollarsToCents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
