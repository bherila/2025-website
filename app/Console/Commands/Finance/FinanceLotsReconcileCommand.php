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

        return $document;
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
