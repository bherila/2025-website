<?php

namespace App\Console\Commands\Finance;

use App\Models\User;
use App\Services\Finance\CapitalGains\LotReconciliationService;

class FinanceLotsReconcileCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:lots-reconcile
        {--user= : User ID to inspect; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year; defaults to current year when --tax-document is omitted}
        {--tax-document= : Reconcile a single fin_tax_documents.id instead of a year}
        {--severity=info : Minimum diagnostic severity to include: info, warning, or error}
        {--format=table : Output format: table or json}
        {--exit-code-on-drift : Return non-zero when any error-severity diagnostic exists}';

    protected $description = 'Compare parsed 1099-B entries against imported fin_account_lots without writing changes.';

    public function __construct(
        private readonly LotReconciliationService $lotReconciliationService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json'])) {
            return self::FAILURE;
        }

        $severity = (string) ($this->option('severity') ?? 'info');
        if (! in_array($severity, ['info', 'warning', 'error'], true)) {
            $this->error("Invalid --severity value '{$severity}'. Use 'info', 'warning', or 'error'.");

            return self::FAILURE;
        }

        $taxDocumentId = $this->taxDocumentIdOption();
        if ($taxDocumentId === false) {
            return self::FAILURE;
        }

        if ($taxDocumentId !== null) {
            $report = $this->lotReconciliationService->reconcileTaxDocument($taxDocumentId);
            $payload = $report->toArray();
            $hasErrorDiagnostics = $report->hasErrorDiagnostics();
        } else {
            $userId = (int) ($this->option('user') ?: $this->userId());
            if (! $this->userExists($userId)) {
                $this->error("User ID {$userId} not found. Pass --user for a valid user or set FINANCE_CLI_USER_ID.");

                return self::FAILURE;
            }

            $year = (int) ($this->option('year') ?: date('Y'));
            $report = $this->lotReconciliationService->reconcileYear($userId, $year);
            $payload = $report->toArray();
            $hasErrorDiagnostics = $report->hasErrorDiagnostics();
        }

        $filteredPayload = $this->filterPayloadBySeverity($payload, $severity);

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($filteredPayload);
        } else {
            $this->renderTable(
                ['Doc ID', 'Broker', 'Year', 'Status', 'Top reason codes', 'Max delta'],
                $this->tableRows($filteredPayload),
            );
        }

        if ((bool) $this->option('exit-code-on-drift') && $hasErrorDiagnostics) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function taxDocumentIdOption(): int|false|null
    {
        $raw = $this->option('tax-document');
        if ($raw === null || $raw === '') {
            return null;
        }

        $taxDocumentId = (int) $raw;
        if ($taxDocumentId <= 0 || (string) $taxDocumentId !== (string) $raw) {
            $this->error('--tax-document must be a positive integer.');

            return false;
        }

        return $taxDocumentId;
    }

    private function userExists(int $userId): bool
    {
        return User::query()->whereKey($userId)->exists();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function filterPayloadBySeverity(array $payload, string $minimumSeverity): array
    {
        if ($minimumSeverity === 'info') {
            return $payload;
        }

        $allowedSeverities = $minimumSeverity === 'warning'
            ? ['warning' => true, 'error' => true]
            : ['error' => true];

        if (isset($payload['documents']) && is_array($payload['documents'])) {
            $payload['documents'] = array_map(
                fn (mixed $document): mixed => is_array($document) ? $this->filterDocumentPayload($document, $allowedSeverities) : $document,
                $payload['documents'],
            );
            $payload['summary'] = $this->yearSummary($payload['documents']);

            return $payload;
        }

        return $this->filterDocumentPayload($payload, $allowedSeverities);
    }

    /**
     * @param  array<string, mixed>  $document
     * @param  array<string, true>  $allowedSeverities
     * @return array<string, mixed>
     */
    private function filterDocumentPayload(array $document, array $allowedSeverities): array
    {
        if (isset($document['diagnostics']) && is_array($document['diagnostics'])) {
            $document['diagnostics'] = array_values(array_filter(
                $document['diagnostics'],
                static fn (mixed $diagnostic): bool => is_array($diagnostic) && isset($allowedSeverities[(string) ($diagnostic['severity'] ?? 'info')]),
            ));
        }

        if (isset($document['entries']) && is_array($document['entries'])) {
            $document['entries'] = array_map(
                function (mixed $entry) use ($allowedSeverities): mixed {
                    if (! is_array($entry) || ! isset($entry['diagnostics']) || ! is_array($entry['diagnostics'])) {
                        return $entry;
                    }

                    $entry['diagnostics'] = array_values(array_filter(
                        $entry['diagnostics'],
                        static fn (mixed $diagnostic): bool => is_array($diagnostic) && isset($allowedSeverities[(string) ($diagnostic['severity'] ?? 'info')]),
                    ));

                    return $entry;
                },
                $document['entries'],
            );
        }

        $document['summary'] = $this->documentSummary(
            is_array($document['summary'] ?? null) ? $document['summary'] : [],
            is_array($document['diagnostics'] ?? null) ? $document['diagnostics'] : [],
        );
        $document['status'] = (string) $document['summary']['status'];

        return $document;
    }

    /**
     * @param  array<string, mixed>  $existingSummary
     * @param  array<int, mixed>  $diagnostics
     * @return array<string, mixed>
     */
    private function documentSummary(array $existingSummary, array $diagnostics): array
    {
        $severityCounts = $this->severityCounts($diagnostics);

        return array_merge($existingSummary, [
            'status' => $this->statusFromSeverityCounts($severityCounts),
            'diagnostics_count' => count($diagnostics),
            'by_severity' => $severityCounts,
            'by_reason' => $this->reasonCounts($diagnostics),
        ]);
    }

    /**
     * @param  array<int, mixed>  $documents
     * @return array<string, mixed>
     */
    private function yearSummary(array $documents): array
    {
        $diagnostics = [];
        $documentCount = 0;
        $entryCount = 0;
        $expectedLotCount = 0;
        $brokerLotCount = 0;
        $maxDelta = 0.0;

        foreach ($documents as $document) {
            if (! is_array($document)) {
                continue;
            }

            $documentCount++;
            foreach (($document['diagnostics'] ?? []) as $diagnostic) {
                if (is_array($diagnostic)) {
                    $diagnostics[] = $diagnostic;
                }
            }

            $summary = is_array($document['summary'] ?? null) ? $document['summary'] : [];
            $entryCount += (int) ($summary['entry_count'] ?? 0);
            $expectedLotCount += (int) ($summary['expected_lot_count'] ?? 0);
            $brokerLotCount += (int) ($summary['broker_lot_count'] ?? 0);
            $maxDelta = max($maxDelta, (float) ($summary['max_delta'] ?? 0.0));
        }

        $severityCounts = $this->severityCounts($diagnostics);

        return [
            'status' => $this->statusFromSeverityCounts($severityCounts),
            'document_count' => $documentCount,
            'entry_count' => $entryCount,
            'expected_lot_count' => $expectedLotCount,
            'broker_lot_count' => $brokerLotCount,
            'diagnostics_count' => count($diagnostics),
            'by_severity' => $severityCounts,
            'by_reason' => $this->reasonCounts($diagnostics),
            'max_delta' => round($maxDelta, 4),
        ];
    }

    /**
     * @param  array<int, mixed>  $diagnostics
     * @return array{info: int, warning: int, error: int}
     */
    private function severityCounts(array $diagnostics): array
    {
        $counts = ['info' => 0, 'warning' => 0, 'error' => 0];

        foreach ($diagnostics as $diagnostic) {
            if (! is_array($diagnostic)) {
                continue;
            }

            $severity = (string) ($diagnostic['severity'] ?? 'info');
            if (isset($counts[$severity])) {
                $counts[$severity]++;
            }
        }

        return $counts;
    }

    /**
     * @param  array<int, mixed>  $diagnostics
     * @return array<string, int>
     */
    private function reasonCounts(array $diagnostics): array
    {
        $counts = [];

        foreach ($diagnostics as $diagnostic) {
            if (! is_array($diagnostic)) {
                continue;
            }

            $code = (string) ($diagnostic['code'] ?? 'unknown');
            $counts[$code] = ($counts[$code] ?? 0) + 1;
        }

        ksort($counts);

        return $counts;
    }

    /**
     * @param  array{info: int, warning: int, error: int}  $severityCounts
     */
    private function statusFromSeverityCounts(array $severityCounts): string
    {
        if ($severityCounts['error'] > 0) {
            return 'error';
        }

        if ($severityCounts['warning'] > 0) {
            return 'warning';
        }

        if ($severityCounts['info'] > 0) {
            return 'info';
        }

        return 'ok';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<int, array<int, mixed>>
     */
    private function tableRows(array $payload): array
    {
        if (isset($payload['documents']) && is_array($payload['documents'])) {
            return array_values(array_map(
                fn (mixed $document): array => is_array($document) ? $this->documentRow($document) : [],
                $payload['documents'],
            ));
        }

        return [$this->documentRow($payload)];
    }

    /**
     * @param  array<string, mixed>  $document
     * @return array<int, mixed>
     */
    private function documentRow(array $document): array
    {
        $summary = is_array($document['summary'] ?? null) ? $document['summary'] : [];

        return [
            $document['tax_document_id'] ?? '',
            $document['broker'] ?? '',
            $document['tax_year'] ?? '',
            $this->statusBadge((string) ($document['status'] ?? 'ok')),
            $this->topReasonCodes($summary),
            number_format((float) ($summary['max_delta'] ?? 0.0), 2),
        ];
    }

    private function statusBadge(string $status): string
    {
        return match ($status) {
            'error' => 'DRIFT',
            'warning' => 'WARN',
            'info' => 'INFO',
            default => 'OK',
        };
    }

    /**
     * @param  array<string, mixed>  $summary
     */
    private function topReasonCodes(array $summary): string
    {
        $counts = is_array($summary['by_reason'] ?? null) ? $summary['by_reason'] : [];
        if ($counts === []) {
            return '-';
        }

        arsort($counts);

        return implode(', ', array_slice(array_keys($counts), 0, 3));
    }
}
