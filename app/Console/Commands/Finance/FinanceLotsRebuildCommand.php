<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Services\Finance\CapitalGains\LotImportFromParsedDataService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class FinanceLotsRebuildCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:lots-rebuild
        {--tax-document= : Rebuild one fin_tax_documents.id}
        {--user= : User ID for --all-broker-docs; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year for --all-broker-docs; defaults to current year}
        {--all-broker-docs : Rebuild all broker 1099-B documents for --user and --year}
        {--dry-run : Preview delete/insert counts without writing changes}
        {--format=table : Output format: table or json}';

    protected $description = 'Rebuild broker-reported fin_account_lots from stored parsed 1099-B data.';

    public function __construct(
        private readonly LotImportFromParsedDataService $lotImportFromParsedDataService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json'])) {
            return self::FAILURE;
        }

        $documents = $this->documentsToRebuild();
        if ($documents === false) {
            return self::FAILURE;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $results = [];

        foreach ($documents as $document) {
            $result = $isDryRun
                ? $this->lotImportFromParsedDataService->previewForDocument((int) $document->document_id)
                : $this->lotImportFromParsedDataService->rebuildForDocument((int) $document->document_id);

            $results[] = array_merge([
                'taxDocumentId' => (int) $document->id,
                'documentId' => (int) $document->document_id,
                'taxYear' => (int) $document->tax_year,
                'filename' => (string) $document->original_filename,
            ], $result->toArray());
        }

        $payload = [
            'dryRun' => $isDryRun,
            'documentCount' => count($results),
            'totals' => [
                'insertedCount' => array_sum(array_column($results, 'insertedCount')),
                'deletedCount' => array_sum(array_column($results, 'deletedCount')),
                'warningCount' => array_sum(array_map(static fn (array $result): int => count($result['warnings']), $results)),
            ],
            'results' => $results,
            'hint' => $this->reconciliationHint($documents),
        ];

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($payload);

            return self::SUCCESS;
        }

        $this->renderTable(
            ['Doc ID', 'Year', 'Filename', 'Deleted', 'Inserted', 'Warnings'],
            array_map(
                static fn (array $result): array => [
                    $result['taxDocumentId'],
                    $result['taxYear'],
                    mb_strimwidth((string) $result['filename'], 0, 42, '...'),
                    $result['deletedCount'],
                    $result['insertedCount'],
                    count($result['warnings']),
                ],
                $results,
            ),
        );

        $warningRows = $this->warningRows($results);
        if ($warningRows !== []) {
            $this->newLine();
            $this->renderTable(['Doc ID', 'Warning'], $warningRows);
        }

        $this->line($payload['hint']);

        if ($isDryRun) {
            $this->line('Dry-run mode: no changes written.');
        }

        return self::SUCCESS;
    }

    /**
     * @return Collection<int, FileForTaxDocument>|false
     */
    private function documentsToRebuild(): Collection|false
    {
        $taxDocumentId = $this->positiveIntegerOption('tax-document');
        if ($taxDocumentId === false) {
            return false;
        }

        if ($taxDocumentId !== null) {
            $document = FileForTaxDocument::query()->find($taxDocumentId);
            if (! $document instanceof FileForTaxDocument) {
                $this->error("Tax document {$taxDocumentId} not found.");

                return false;
            }

            return new Collection([$document]);
        }

        if (! (bool) $this->option('all-broker-docs')) {
            $this->error('Pass --tax-document=<id> or --all-broker-docs.');

            return false;
        }

        $userId = (int) ($this->option('user') ?: $this->userId());
        if (! User::query()->whereKey($userId)->exists()) {
            $this->error("User ID {$userId} not found. Pass --user for a valid user or set FINANCE_CLI_USER_ID.");

            return false;
        }

        $year = (int) ($this->option('year') ?: date('Y'));
        if ($year < 1900 || $year > 2100) {
            $this->error('--year must be between 1900 and 2100.');

            return false;
        }

        $documents = FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', [FileForTaxDocument::FORM_TYPE_1099_B, 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', FileForTaxDocument::FORM_TYPE_1099_B);
                    });
            })
            ->orderBy('id')
            ->get();

        if ($documents->isEmpty()) {
            $this->error("No matching 1099-B documents found for user {$userId}, year {$year}.");

            return false;
        }

        return $documents;
    }

    private function positiveIntegerOption(string $name): int|false|null
    {
        $raw = $this->option($name);
        if ($raw === null || $raw === '') {
            return null;
        }

        $value = (int) $raw;
        if ($value <= 0 || (string) $value !== (string) $raw) {
            $this->error("--{$name} must be a positive integer.");

            return false;
        }

        return $value;
    }

    /**
     * @param  array<int, array<string, mixed>>  $results
     * @return array<int, array{int, string}>
     */
    private function warningRows(array $results): array
    {
        $rows = [];
        foreach ($results as $result) {
            foreach ($result['warnings'] as $warning) {
                $rows[] = [(int) $result['taxDocumentId'], (string) $warning];
            }
        }

        return $rows;
    }

    /**
     * @param  Collection<int, FileForTaxDocument>  $documents
     */
    private function reconciliationHint(Collection $documents): string
    {
        $first = $documents->first();
        if (! $first instanceof FileForTaxDocument) {
            throw new \LogicException('Cannot build a lot reconciliation hint without at least one tax document.');
        }

        if ($documents->count() === 1) {
            return 'Next: php artisan finance:lots-reconcile --tax-document='.$first->id;
        }

        return sprintf(
            'Next: php artisan finance:lots-reconcile --user=%d --year=%d',
            (int) $first->user_id,
            (int) $first->tax_year,
        );
    }
}
