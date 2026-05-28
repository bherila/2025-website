<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\LotMatchRun;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class ReconciliationSummaryService
{
    public const string HEALTH_OK = 'ok';

    public const string HEALTH_DRIFT = 'drift';

    public const string HEALTH_BLOCKED = 'blocked';

    public const array HEALTH_VALUES = [
        self::HEALTH_OK,
        self::HEALTH_DRIFT,
        self::HEALTH_BLOCKED,
    ];

    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public static function cacheKey(int $userId, int $year): string
    {
        return "finance:reconciliation-summary:{$userId}:{$year}";
    }

    /**
     * @return array<string, mixed>
     */
    public function summaryForYear(int $userId, int $year): array
    {
        return Cache::remember(self::cacheKey($userId, $year), now()->addSeconds(60), function () use ($userId, $year): array {
            return $this->uncachedSummaryForYear($userId, $year);
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function uncachedSummaryForYear(int $userId, int $year): array
    {
        $documents = FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', [FileForTaxDocument::FORM_TYPE_1099_B, 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', FileForTaxDocument::FORM_TYPE_1099_B);
                    });
            })
            ->with(['accountLinks.account'])
            ->orderBy('id')
            ->get();

        $documentIds = $documents
            ->pluck('document_id')
            ->filter()
            ->map(static fn (int|string $documentId): int => (int) $documentId)
            ->values()
            ->all();

        $countsByDocument = $this->linkStateCountsByDocument($documentIds);
        $latestRuns = $this->latestRunsByDocument($documentIds, $userId);
        $summaryCounts = $this->emptyLinkStateCounts();
        $documentsByHealth = array_fill_keys(self::HEALTH_VALUES, 0);
        $unresolvedAccountLinks = [];
        $documentPayloads = [];

        foreach ($documents as $taxDocument) {
            $documentId = $taxDocument->document_id !== null ? (int) $taxDocument->document_id : null;
            $linkCounts = $documentId !== null
                ? ($countsByDocument[$documentId] ?? $this->emptyLinkStateCounts())
                : $this->emptyLinkStateCounts();
            $unresolvedLinks = $this->unresolvedAccountLinks($taxDocument);
            $health = $this->healthForDocument($linkCounts, $unresolvedLinks->count());

            foreach ($linkCounts as $state => $count) {
                $summaryCounts[$state] = ($summaryCounts[$state] ?? 0) + (int) $count;
            }

            $documentsByHealth[$health]++;

            foreach ($unresolvedLinks as $link) {
                $unresolvedAccountLinks[] = $this->accountLinkPayload($link, $taxDocument);
            }

            $latestRun = $documentId !== null ? ($latestRuns[$documentId] ?? null) : null;
            $documentPayloads[] = [
                'tax_document_id' => (int) $taxDocument->id,
                'document_id' => $documentId,
                'broker' => $this->documentBrokerName($taxDocument),
                'form_type' => (string) $taxDocument->form_type,
                'original_filename' => $taxDocument->original_filename,
                'tax_year' => (int) $taxDocument->tax_year,
                'health' => $health,
                'last_matched_at' => $documentId !== null ? $this->lotMatcherService->lastMatchedAtForDocument($documentId) : null,
                'unresolved_account_links' => $unresolvedLinks->count(),
                'link_state_counts' => $linkCounts,
                'problem_bucket_counts' => $this->problemBucketCounts($linkCounts, $unresolvedLinks->count()),
                'latest_match_run' => $latestRun instanceof LotMatchRun ? $latestRun->payload() : null,
            ];
        }

        return [
            'user_id' => $userId,
            'tax_year' => $year,
            'summary' => [
                'document_count' => $documents->count(),
                'unresolved_account_links' => count($unresolvedAccountLinks),
                'link_state_counts' => $summaryCounts,
                'documents_by_health' => $documentsByHealth,
                'problem_bucket_counts' => $this->aggregateProblemBucketCounts($documentPayloads),
            ],
            'documents' => $documentPayloads,
            'unresolved_account_links' => $unresolvedAccountLinks,
        ];
    }

    /**
     * @param  list<int>  $documentIds
     * @return array<int, array<string, int>>
     */
    private function linkStateCountsByDocument(array $documentIds): array
    {
        if ($documentIds === []) {
            return [];
        }

        /** @var Collection<int, FinLotReconciliationLink> $rows */
        $rows = FinLotReconciliationLink::query()
            ->selectRaw('document_id, state, COUNT(*) as aggregate_count')
            ->whereIn('document_id', $documentIds)
            ->groupBy('document_id', 'state')
            ->get();

        $counts = [];
        foreach ($documentIds as $documentId) {
            $counts[$documentId] = $this->emptyLinkStateCounts();
        }

        foreach ($rows as $row) {
            $documentId = (int) $row->document_id;
            $state = (string) $row->state;
            $counts[$documentId][$state] = (int) $row->getAttribute('aggregate_count');
        }

        return $counts;
    }

    /**
     * @param  list<int>  $documentIds
     * @return array<int, LotMatchRun>
     */
    private function latestRunsByDocument(array $documentIds, int $userId): array
    {
        if ($documentIds === []) {
            return [];
        }

        /** @var Collection<int, LotMatchRun> $runs */
        $runs = LotMatchRun::query()
            ->whereIn('document_id', $documentIds)
            ->where('user_id', $userId)
            ->latest('id')
            ->get();

        $latestRuns = [];
        foreach ($runs as $run) {
            $documentId = (int) $run->document_id;
            if (! isset($latestRuns[$documentId])) {
                $latestRuns[$documentId] = $run;
            }
        }

        return $latestRuns;
    }

    /**
     * @return Collection<int, TaxDocumentAccount>
     */
    private function unresolvedAccountLinks(FileForTaxDocument $taxDocument): Collection
    {
        /** @var Collection<int, TaxDocumentAccount> $links */
        $links = $taxDocument->accountLinks
            ->filter(fn ($link): bool => $link instanceof TaxDocumentAccount
                && (string) $link->form_type === FileForTaxDocument::FORM_TYPE_1099_B
                && $link->account_id === null)
            ->values();

        return $links;
    }

    /**
     * @param  array<string, int>  $linkCounts
     */
    private function healthForDocument(array $linkCounts, int $unresolvedAccountLinks): string
    {
        if ($unresolvedAccountLinks > 0 || array_sum($linkCounts) === 0) {
            return self::HEALTH_BLOCKED;
        }

        $blockedStates = [
            FinLotReconciliationLink::STATE_UNLINKED,
            FinLotReconciliationLink::STATE_BROKER_ONLY,
            FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
        ];

        foreach ($blockedStates as $state) {
            if (($linkCounts[$state] ?? 0) > 0) {
                return self::HEALTH_BLOCKED;
            }
        }

        if (($linkCounts[FinLotReconciliationLink::STATE_NEEDS_REVIEW] ?? 0) > 0) {
            return self::HEALTH_DRIFT;
        }

        return self::HEALTH_OK;
    }

    /**
     * @return array<string, int>
     */
    private function emptyLinkStateCounts(): array
    {
        return array_fill_keys(FinLotReconciliationLink::STATES, 0);
    }

    /**
     * @param  array<string, int>  $linkCounts
     * @return array<string, int>
     */
    private function problemBucketCounts(array $linkCounts, int $unresolvedAccountLinks): array
    {
        return [
            'missing_accounts' => $unresolvedAccountLinks,
            'mismatches' => (int) ($linkCounts[FinLotReconciliationLink::STATE_NEEDS_REVIEW] ?? 0),
            'broker_only' => (int) ($linkCounts[FinLotReconciliationLink::STATE_BROKER_ONLY] ?? 0),
            'account_only' => (int) ($linkCounts[FinLotReconciliationLink::STATE_ACCOUNT_ONLY] ?? 0),
            'duplicates' => (int) ($linkCounts[FinLotReconciliationLink::STATE_IGNORED_DUPLICATE] ?? 0),
            'auto_matched' => (int) ($linkCounts[FinLotReconciliationLink::STATE_AUTO_MATCHED] ?? 0),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $documents
     * @return array<string, int>
     */
    private function aggregateProblemBucketCounts(array $documents): array
    {
        $counts = $this->problemBucketCounts($this->emptyLinkStateCounts(), 0);

        foreach ($documents as $document) {
            $bucketCounts = is_array($document['problem_bucket_counts'] ?? null) ? $document['problem_bucket_counts'] : [];
            foreach ($bucketCounts as $bucket => $count) {
                $counts[(string) $bucket] = ($counts[(string) $bucket] ?? 0) + (int) $count;
            }
        }

        return $counts;
    }

    /**
     * @return array<string, mixed>
     */
    private function accountLinkPayload(TaxDocumentAccount $link, FileForTaxDocument $taxDocument): array
    {
        $account = $link->relationLoaded('account') ? $link->account : null;

        return [
            'id' => (int) $link->id,
            'document_id' => (int) $link->document_id,
            'tax_document_id' => (int) $taxDocument->id,
            'account_id' => $link->account_id !== null ? (int) $link->account_id : null,
            'form_type' => $link->form_type,
            'tax_year' => $link->tax_year,
            'account_section_label' => $link->account_section_label,
            'ai_identifier' => $link->ai_identifier,
            'ai_account_name' => $link->ai_account_name,
            'is_reviewed' => (bool) $link->is_reviewed,
            'source_filename' => $taxDocument->original_filename,
            'account' => $account instanceof FinAccounts ? [
                'acct_id' => (int) $account->acct_id,
                'acct_name' => (string) $account->acct_name,
                'acct_number' => $account->acct_number,
            ] : null,
        ];
    }

    private function documentBrokerName(FileForTaxDocument $taxDocument): string
    {
        $parsedData = $taxDocument->parsed_data;
        $entries = is_array($parsedData) && array_is_list($parsedData) ? $parsedData : [$parsedData];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $payload = is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : $entry;
            $payerName = $payload['payer_name'] ?? null;
            if (is_string($payerName) && trim($payerName) !== '') {
                return trim($payerName);
            }

            $accountName = $entry['account_name'] ?? null;
            if (is_string($accountName) && trim($accountName) !== '') {
                return trim($accountName);
            }
        }

        return $taxDocument->original_filename;
    }
}
