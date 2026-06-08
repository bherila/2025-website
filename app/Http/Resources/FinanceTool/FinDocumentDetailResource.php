<?php

namespace App\Http\Resources\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\FinStatement;
use App\Services\Finance\DocumentCapabilityService;
use App\Services\Finance\TaxDocumentParsedDataNormalizer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

class FinDocumentDetailResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $document = $this->resource;
        $capabilityService = app(DocumentCapabilityService::class);
        $statementRows = $this->statementRows($document);
        $lotSummary = $this->lotSummary($document);

        return [
            'id' => (int) $document->id,
            'document_kind' => (string) $document->document_kind,
            'document_type' => $document->document_type,
            'document_date' => $this->dateString($document->document_date),
            'tax_year' => $document->tax_year,
            'period_start' => $this->dateString($document->period_start),
            'period_end' => $this->dateString($document->period_end),
            'original_filename' => $document->original_filename,
            'stored_filename' => $document->stored_filename,
            'mime_type' => $document->mime_type,
            'file_size_bytes' => $document->file_size_bytes,
            'human_file_size' => $document->human_file_size,
            'genai_job_id' => $document->genai_job_id,
            'genai_status' => $document->genai_status,
            'parsed_data_needs_review' => (bool) $document->parsed_data_needs_review,
            'parsed_data_warnings' => $document->parsed_data_warnings,
            'is_reviewed' => (bool) $document->is_reviewed,
            'notes' => $document->notes,
            'download_count' => (int) $document->download_count,
            'created_at' => $this->dateString($document->created_at),
            'updated_at' => $this->dateString($document->updated_at),
            'accounts' => $this->accountLinks($document),
            'tax_document' => $this->taxDocumentSummary($document),
            'statements' => $statementRows,
            'statement_facet' => $this->statementFacet($document, $statementRows),
            'tax_facet' => $this->taxFacet($document),
            'lot_summary' => $lotSummary,
            'lot_summary_facet' => $lotSummary,
            'capabilities' => $capabilityService->capabilities($document),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function accountLinks(FinDocument $document): array
    {
        if (! $document->relationLoaded('accounts')) {
            return [];
        }

        return $document->accounts
            ->map(fn (FinDocumentAccount $link): array => [
                'id' => (int) $link->id,
                'document_id' => (int) $link->document_id,
                'account_id' => $link->account_id,
                'statement_id' => $link->statement_id,
                'form_type' => $link->form_type,
                'tax_year' => $link->tax_year,
                'account_section_label' => $link->account_section_label,
                'payload_kind' => $link->payload_kind,
                'ai_identifier' => $link->ai_identifier,
                'ai_account_name' => $link->ai_account_name,
                'is_reviewed' => (bool) $link->is_reviewed,
                'notes' => $link->getAttribute('notes'),
                'misc_routing' => $link->getAttribute('misc_routing'),
                'reporting_mode' => $link->getAttribute('reporting_mode'),
                'parsed_data_needs_review' => (bool) $link->getAttribute('parsed_data_needs_review'),
                'parsed_data_warnings' => $link->getAttribute('parsed_data_warnings'),
                'account' => $this->account($link),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function account(FinDocumentAccount $link): ?array
    {
        $account = $link->relationLoaded('account') ? $link->account : null;

        if (! $account instanceof FinAccounts) {
            return null;
        }

        return [
            'acct_id' => (int) $account->acct_id,
            'acct_name' => (string) $account->acct_name,
            'acct_number' => $account->acct_number,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function taxDocumentSummary(FinDocument $document): ?array
    {
        $taxDocument = $document->relationLoaded('taxDocument') ? $document->taxDocument : null;

        if (! $taxDocument instanceof FileForTaxDocument) {
            return null;
        }

        return [
            'id' => (int) $taxDocument->id,
            'document_id' => (int) $taxDocument->document_id,
            'form_type' => $taxDocument->form_type,
            'tax_year' => $taxDocument->tax_year,
            'is_reviewed' => (bool) $taxDocument->is_reviewed,
            'genai_status' => $taxDocument->genai_status,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function statementRows(FinDocument $document): array
    {
        if (! $document->relationLoaded('statements')) {
            return [];
        }

        return $document->statements
            ->map(fn (FinStatement $stmt): array => [
                'id' => (int) $stmt->statement_id,
                'acct_id' => $stmt->acct_id,
                'statement_closing_date' => $this->dateString($stmt->statement_closing_date),
                'closing_balance' => $stmt->balance,
                'imported_transactions_count' => (int) ($stmt->getAttribute('imported_transactions_count') ?? 0),
                'imported_lots_count' => (int) ($stmt->getAttribute('imported_lots_count') ?? 0),
                'account' => $this->statementAccount($stmt),
                'source_job' => $this->jobSummary(
                    $stmt->relationLoaded('genaiJob') ? $stmt->genaiJob : null,
                    $stmt->genai_job_id,
                ),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $statementRows
     * @return array<string, mixed>|null
     */
    private function statementFacet(FinDocument $document, array $statementRows): ?array
    {
        if ((string) $document->document_kind !== FinDocument::KIND_STATEMENT && $statementRows === []) {
            return null;
        }

        $statementIds = array_map(
            static fn (array $row): int => (int) $row['id'],
            $statementRows,
        );

        return [
            'document_id' => (int) $document->id,
            'period' => [
                'start' => $this->dateString($document->period_start),
                'end' => $this->dateString($document->period_end) ?? $this->latestStatementClosingDate($statementRows),
            ],
            'linked_accounts' => $this->statementLinkedAccounts($document, $statementRows),
            'balance_snapshots_count' => count($statementRows),
            'imported_transactions_count' => $this->statementTransactionCount($document, $statementIds),
            'imported_lots_count' => $this->statementLotCount($document, $statementIds),
            'parsed_data_needs_review' => (bool) $document->parsed_data_needs_review,
            'parsed_data_warnings' => $document->parsed_data_warnings,
            'source_job' => $this->jobSummary(
                $document->relationLoaded('genaiJob') ? $document->genaiJob : null,
                $document->genai_job_id,
            ),
            'statements' => $statementRows,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function taxFacet(FinDocument $document): ?array
    {
        $taxDocument = $document->relationLoaded('taxDocument') ? $document->taxDocument : null;

        if (! $taxDocument instanceof FileForTaxDocument) {
            return null;
        }

        $taxPayload = app(TaxDocumentParsedDataNormalizer::class)->documentForResponse($taxDocument);
        $warnings = is_array($taxPayload['parsed_data_warnings'] ?? null) ? $taxPayload['parsed_data_warnings'] : [];
        $needsReview = (bool) ($taxPayload['parsed_data_needs_review'] ?? false);

        return [
            'document_id' => (int) $document->id,
            'tax_document_id' => (int) $taxDocument->id,
            'form_type' => $taxDocument->form_type,
            'tax_year' => $taxDocument->tax_year,
            'review_status' => $taxDocument->is_reviewed ? 'reviewed' : ($needsReview ? 'needs_review' : 'unreviewed'),
            'parsing_status' => $taxDocument->genai_status,
            'is_reviewed' => (bool) $taxDocument->is_reviewed,
            'parsed_data_summary' => $this->parsedDataSummary($taxPayload['parsed_data'] ?? null, $warnings),
            'account_links' => $taxPayload['account_links'] ?? [],
            'downstream_effects' => [
                'linked_lots_count' => $this->documentLotCount($document),
                'reconciliation_link_counts_by_state' => $this->reconciliationLinkCountsForDocument((int) $document->id),
            ],
            'review_document' => $taxPayload,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function lotSummary(FinDocument $document): array
    {
        $lots = $this->documentLots($document);
        $lotIds = $lots
            ->pluck('lot_id')
            ->map(static fn (mixed $lotId): int => (int) $lotId)
            ->values()
            ->all();

        return [
            'count' => $lots->count(),
            'counts_by_source' => $this->countsByLotSource($lots),
            'counts_by_reconciliation_state' => $this->countsByLatestLinkState($lotIds),
            'workspace_url' => "/finance/documents?document_id={$document->id}",
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function statementAccount(FinStatement $stmt): ?array
    {
        $account = $stmt->relationLoaded('account') ? $stmt->account : null;

        if (! $account instanceof FinAccounts) {
            return null;
        }

        return [
            'acct_id' => (int) $account->acct_id,
            'acct_name' => (string) $account->acct_name,
            'acct_number' => $account->acct_number,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $statementRows
     */
    private function latestStatementClosingDate(array $statementRows): ?string
    {
        $dates = array_values(array_filter(
            array_map(static fn (array $row): ?string => is_string($row['statement_closing_date'] ?? null) ? $row['statement_closing_date'] : null, $statementRows),
        ));

        if ($dates === []) {
            return null;
        }

        rsort($dates);

        return $dates[0];
    }

    /**
     * @param  list<array<string, mixed>>  $statementRows
     * @return list<array<string, mixed>>
     */
    private function statementLinkedAccounts(FinDocument $document, array $statementRows): array
    {
        $accounts = $this->accountLinks($document);

        foreach ($statementRows as $row) {
            $account = $row['account'] ?? null;
            if (is_array($account)) {
                $accounts[] = [
                    'account_id' => $account['acct_id'] ?? null,
                    'account' => $account,
                ];
            }
        }

        $seen = [];

        return collect($accounts)
            ->filter(static fn (array $row): bool => isset($row['account_id']) || isset($row['account']['acct_id']))
            ->filter(function (array $row) use (&$seen): bool {
                $accountId = (int) ($row['account_id'] ?? $row['account']['acct_id'] ?? 0);
                if ($accountId <= 0 || isset($seen[$accountId])) {
                    return false;
                }

                $seen[$accountId] = true;

                return true;
            })
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $statementIds
     */
    private function statementTransactionCount(FinDocument $document, array $statementIds): int
    {
        if ($document->relationLoaded('statements')) {
            $sum = 0;
            $hasCounts = true;

            foreach ($document->statements as $statement) {
                $count = $statement->getAttribute('imported_transactions_count');
                if ($count === null) {
                    $hasCounts = false;

                    break;
                }

                $sum += (int) $count;
            }

            if ($hasCounts) {
                return $sum;
            }
        }

        if ($statementIds === []) {
            return 0;
        }

        return FinAccountLineItems::query()->whereIn('statement_id', $statementIds)->count();
    }

    /**
     * @param  list<int>  $statementIds
     */
    private function statementLotCount(FinDocument $document, array $statementIds): int
    {
        if ($document->relationLoaded('statements')) {
            $sum = 0;
            $hasCounts = true;

            foreach ($document->statements as $statement) {
                $count = $statement->getAttribute('imported_lots_count');
                if ($count === null) {
                    $hasCounts = false;

                    break;
                }

                $sum += (int) $count;
            }

            if ($hasCounts) {
                return $sum;
            }
        }

        if ($statementIds === []) {
            return $this->documentLotCount($document);
        }

        return FinAccountLot::query()->whereIn('statement_id', $statementIds)->count();
    }

    private function documentLotCount(FinDocument $document): int
    {
        return $this->documentLots($document)->count();
    }

    /**
     * @return Collection<int, FinAccountLot>
     */
    private function documentLots(FinDocument $document): Collection
    {
        if ($document->relationLoaded('lots')) {
            return $document->lots;
        }

        return FinAccountLot::query()
            ->where('document_id', (int) $document->id)
            ->get(['lot_id', 'document_id', 'source', 'lot_source']);
    }

    /**
     * @param  Collection<int, FinAccountLot>  $lots
     * @return array<string, int>
     */
    private function countsByLotSource(Collection $lots): array
    {
        $counts = [];

        foreach ($lots as $lot) {
            $source = $this->effectiveLotSource($lot);
            $counts[$source] = ($counts[$source] ?? 0) + 1;
        }

        ksort($counts);

        return $counts;
    }

    private function effectiveLotSource(FinAccountLot $lot): string
    {
        if (in_array($lot->lot_source, [FinAccountLot::SOURCE_1099B, FinAccountLot::SOURCE_1099B_UNDERSCORE], true)) {
            return FinAccountLot::SOURCE_BROKER_1099B;
        }

        return $lot->source ?: 'none';
    }

    /**
     * @param  list<int>  $lotIds
     * @return array<string, int>
     */
    private function countsByLatestLinkState(array $lotIds): array
    {
        if ($lotIds === []) {
            return [];
        }

        $lotIdLookup = array_fill_keys($lotIds, true);
        $stateByLotId = [];
        $links = FinLotReconciliationLink::query()
            ->where(function ($query) use ($lotIds): void {
                $query
                    ->whereIn('broker_lot_id', $lotIds)
                    ->orWhereIn('account_lot_id', $lotIds);
            })
            ->orderByDesc('id')
            ->get(['id', 'broker_lot_id', 'account_lot_id', 'state']);

        foreach ($links as $link) {
            foreach (['broker_lot_id', 'account_lot_id'] as $attribute) {
                $lotId = (int) ($link->getAttribute($attribute) ?? 0);
                if ($lotId > 0 && isset($lotIdLookup[$lotId]) && ! array_key_exists($lotId, $stateByLotId)) {
                    $stateByLotId[$lotId] = (string) $link->getAttribute('state');
                }
            }
        }

        $counts = [];
        foreach ($lotIds as $lotId) {
            $state = $stateByLotId[$lotId] ?? 'none';
            $counts[$state] = ($counts[$state] ?? 0) + 1;
        }
        ksort($counts);

        return $counts;
    }

    /**
     * @return array<string, int>
     */
    private function reconciliationLinkCountsForDocument(int $documentId): array
    {
        $rows = FinLotReconciliationLink::query()
            ->where('document_id', $documentId)
            ->selectRaw('state, COUNT(*) as cnt')
            ->groupBy('state')
            ->get();

        $counts = [];
        foreach ($rows as $row) {
            $counts[(string) $row->getAttribute('state')] = (int) $row->getAttribute('cnt');
        }
        ksort($counts);

        return $counts;
    }

    /**
     * @param  array<int, mixed>  $warnings
     * @return array<string, mixed>
     */
    private function parsedDataSummary(mixed $parsedData, array $warnings): array
    {
        $isArray = is_array($parsedData);
        $isList = $isArray && array_is_list($parsedData);
        $topLevelKeys = [];

        if ($isArray && ! $isList) {
            $topLevelKeys = array_slice(array_values(array_filter(array_keys($parsedData), 'is_string')), 0, 8);
        }

        return [
            'has_parsed_data' => $parsedData !== null,
            'is_multi_entry' => $isList,
            'entry_count' => $isList ? count($parsedData) : ($parsedData === null ? 0 : 1),
            'top_level_keys' => $topLevelKeys,
            'warnings_count' => count($warnings),
            'needs_review' => $warnings !== [],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function jobSummary(mixed $job, mixed $fallbackId = null): ?array
    {
        if ($job instanceof GenAiImportJob) {
            return [
                'id' => (int) $job->id,
                'status' => $job->status,
                'job_type' => $job->job_type,
                'ai_provider' => $job->ai_provider,
                'ai_model' => $job->ai_model,
                'original_filename' => $job->original_filename,
                'parsed_at' => $this->dateString($job->parsed_at),
            ];
        }

        if ($fallbackId !== null) {
            return ['id' => (int) $fallbackId];
        }

        return null;
    }

    private function dateString(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return null;
    }
}
