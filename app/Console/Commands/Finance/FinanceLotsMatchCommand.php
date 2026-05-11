<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Services\Finance\CapitalGains\LotMatcherResult;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class FinanceLotsMatchCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:lots-match
        {--tax-document= : Match one fin_tax_documents.id}
        {--user= : User ID for --all-broker-docs; defaults to FINANCE_CLI_USER_ID or 1}
        {--year= : Tax year for --all-broker-docs; defaults to current year}
        {--all-broker-docs : Match all broker 1099-B documents for --user and --year}
        {--preserve-decisions=true : Preserve accepted_* and ignored_* decisions: true or false}
        {--dry-run : Preview proposed links without writing changes}
        {--format=table : Output format: table or json}';

    protected $description = 'Persist broker-to-account lot reconciliation links.';

    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        if (! $this->validateFormat(['table', 'json'])) {
            return self::FAILURE;
        }

        $preserveDecisions = $this->preserveDecisionsOption();
        if ($preserveDecisions === null) {
            return self::FAILURE;
        }

        $documents = $this->documentsToMatch();
        if ($documents === false) {
            return self::FAILURE;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $results = [];

        foreach ($documents as $document) {
            $result = $isDryRun
                ? $this->lotMatcherService->previewMatcherForDocument((int) $document->document_id, $preserveDecisions)
                : $this->lotMatcherService->runMatcherForDocument((int) $document->document_id, $preserveDecisions);

            $results[] = $this->documentPayload($document, $result);
        }

        $payload = [
            'dryRun' => $isDryRun,
            'preserveDecisions' => $preserveDecisions,
            'documentCount' => count($results),
            'totals' => $this->totalCounts($results),
            'results' => $results,
        ];

        if (($this->option('format') ?? 'table') === 'json') {
            $this->outputJson($payload);

            return self::SUCCESS;
        }

        $this->renderTable(
            ['Doc ID', 'Year', 'Filename', 'Auto', 'Needs', 'Broker', 'Acct Override', 'Dup', 'Unlinked', 'Broker Only', 'Acct Only'],
            array_map(
                static fn (array $result): array => [
                    $result['taxDocumentId'],
                    $result['taxYear'],
                    mb_strimwidth((string) $result['filename'], 0, 32, '...'),
                    $result['counts']['auto_matched'],
                    $result['counts']['needs_review'],
                    $result['counts']['accepted_broker'],
                    $result['counts']['accepted_account_override'],
                    $result['counts']['ignored_duplicate'],
                    $result['counts']['unlinked'],
                    $result['counts']['broker_only'],
                    $result['counts']['account_only'],
                ],
                $results,
            ),
        );

        if ($isDryRun) {
            $this->line('Dry-run mode: no reconciliation links written.');
        }

        return self::SUCCESS;
    }

    /**
     * @return Collection<int, FileForTaxDocument>|false
     */
    private function documentsToMatch(): Collection|false
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

    private function preserveDecisionsOption(): ?bool
    {
        $raw = strtolower((string) ($this->option('preserve-decisions') ?? 'true'));

        return match ($raw) {
            '1', 'true', 'yes', 'y' => true,
            '0', 'false', 'no', 'n' => false,
            default => $this->invalidPreserveDecisionsOption(),
        };
    }

    private function invalidPreserveDecisionsOption(): null
    {
        $this->error('--preserve-decisions must be true or false.');

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function documentPayload(FileForTaxDocument $document, LotMatcherResult $result): array
    {
        return [
            'taxDocumentId' => (int) $document->id,
            'documentId' => (int) $document->document_id,
            'taxYear' => (int) $document->tax_year,
            'filename' => (string) $document->original_filename,
            'counts' => $result->counts,
            'linkIds' => $result->linkIds,
            'proposals' => array_map(
                static fn ($proposal): array => $proposal->toArray(),
                $result->proposals,
            ),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @return array<string, int>
     */
    private function totalCounts(array $results): array
    {
        $totals = [
            'auto_matched' => 0,
            'needs_review' => 0,
            'accepted_broker' => 0,
            'accepted_account_override' => 0,
            'ignored_duplicate' => 0,
            'unlinked' => 0,
            'broker_only' => 0,
            'account_only' => 0,
        ];

        foreach ($results as $result) {
            foreach ($totals as $state => $count) {
                $totals[$state] = $count + (int) ($result['counts'][$state] ?? 0);
            }
        }

        return $totals;
    }
}
