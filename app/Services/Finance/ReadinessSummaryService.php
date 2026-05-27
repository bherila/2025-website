<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinLotReconciliationLink;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

class ReadinessSummaryService
{
    /**
     * Fast, cacheable readiness summary for Tax Preview home view.
     *
     * Returns compact counts aggregated from:
     * - Document counts by kind (W-2, 1099, K-1, etc.)
     * - Pending review count
     * - Missing account count (1099-B docs without linked accounts)
     * - Reconciliation health (per-document status → ok / drift / blocked)
     * - Parsing failure count
     * - Last matcher run timestamp
     *
     * @return array<string, mixed>
     */
    public function summaryForYear(int $userId, int $year): array
    {
        $documentsByKind = $this->documentCountsByKind($userId, $year);
        $pendingReviewCount = $this->pendingReviewCount($userId, $year);
        $missingAccountCount = $this->missingAccountCount($userId, $year);
        $reconciliationHealth = $this->reconciliationHealth($userId, $year);
        $parsingFailureCount = $this->parsingFailureCount($userId, $year);
        $lastMatcherRunAt = $this->lastMatcherRunAt($userId, $year);

        return [
            'year' => $year,
            'documents_by_kind' => $documentsByKind,
            'pending_review_count' => $pendingReviewCount,
            'missing_account_count' => $missingAccountCount,
            'reconciliation_health' => $reconciliationHealth,
            'parsing_failure_count' => $parsingFailureCount,
            'last_matcher_run_at' => $lastMatcherRunAt,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function documentCountsByKind(int $userId, int $year): array
    {
        $documents = FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->select(['form_type', 'genai_status'])
            ->get();

        $counts = [
            'w2' => 0,
            '1099_div' => 0,
            '1099_int' => 0,
            '1099_b' => 0,
            '1099_r' => 0,
            'k1' => 0,
            'other' => 0,
        ];

        foreach ($documents as $document) {
            $formType = (string) $document->form_type;

            if (in_array($formType, FileForTaxDocument::W2_FORM_TYPES, true)) {
                $counts['w2']++;
            } elseif (in_array($formType, ['1099_div'], true)) {
                $counts['1099_div']++;
            } elseif (in_array($formType, ['1099_int'], true)) {
                $counts['1099_int']++;
            } elseif (in_array($formType, ['1099_b', 'broker_1099'], true)) {
                $counts['1099_b']++;
            } elseif (in_array($formType, ['1099_r'], true)) {
                $counts['1099_r']++;
            } elseif (in_array($formType, ['k1_1065', 'k1_1120s'], true)) {
                $counts['k1']++;
            } else {
                $counts['other']++;
            }
        }

        return $counts;
    }

    private function pendingReviewCount(int $userId, int $year): int
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('genai_status', 'parsed')
            ->where('is_reviewed', false)
            ->count();
    }

    /**
     * Count 1099-B documents that have no account links.
     */
    private function missingAccountCount(int $userId, int $year): int
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', ['1099_b', 'broker_1099'])
            ->whereDoesntHave('accountLinks')
            ->count();
    }

    /**
     * Aggregate reconciliation status counts: ok / drift / blocked.
     *
     * @return array{ok: int, drift: int, blocked: int}
     */
    private function reconciliationHealth(int $userId, int $year): array
    {
        $documentIds = $this->reconciliationDocumentIds($userId, $year);

        $health = [
            'ok' => 0,
            'drift' => 0,
            'blocked' => 0,
        ];

        if ($documentIds === []) {
            return $health;
        }

        $linkCounts = $this->linkStateCountsByDocumentIds($documentIds);

        foreach ($documentIds as $documentId) {
            $counts = $linkCounts[$documentId] ?? $this->emptyLinkStateCounts();
            $totalLinks = array_sum($counts);

            if ($totalLinks === 0 || $this->hasBlockedLinkState($counts)) {
                $health['blocked']++;
            } elseif (($counts[FinLotReconciliationLink::STATE_NEEDS_REVIEW] ?? 0) > 0) {
                $health['drift']++;
            } else {
                $health['ok']++;
            }
        }

        return $health;
    }

    private function lastMatcherRunAt(int $userId, int $year): ?string
    {
        $documentIds = $this->reconciliationDocumentIds($userId, $year);

        if ($documentIds === []) {
            return null;
        }

        $latestTimestamp = FinLotReconciliationLink::query()
            ->whereIn('document_id', $documentIds)
            ->max('updated_at')
            ?? FinLotReconciliationLink::query()
                ->whereIn('document_id', $documentIds)
                ->max('created_at');

        if (! is_string($latestTimestamp) || trim($latestTimestamp) === '') {
            return null;
        }

        return Carbon::parse($latestTimestamp)->toJSON();
    }

    private function parsingFailureCount(int $userId, int $year): int
    {
        return FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->where('genai_status', 'failed')
            ->count();
    }

    /**
     * @return list<int>
     */
    private function reconciliationDocumentIds(int $userId, int $year): array
    {
        return FileForTaxDocument::query()
            ->where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereNotNull('document_id')
            ->where(function (Builder $query): void {
                $query->whereIn('form_type', ['1099_b', 'broker_1099'])
                    ->orWhereHas('accountLinks', function (Builder $linkQuery): void {
                        $linkQuery->where('form_type', '1099_b');
                    });
            })
            ->pluck('document_id')
            ->map(static fn (mixed $documentId): int => (int) $documentId)
            ->filter(static fn (int $documentId): bool => $documentId > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return array<string, int>
     */
    private function emptyLinkStateCounts(): array
    {
        return array_fill_keys(FinLotReconciliationLink::STATES, 0);
    }

    /**
     * @param  list<int>  $documentIds
     * @return array<int, array<string, int>>
     */
    private function linkStateCountsByDocumentIds(array $documentIds): array
    {
        $counts = [];
        foreach ($documentIds as $documentId) {
            $counts[$documentId] = $this->emptyLinkStateCounts();
        }

        $rows = FinLotReconciliationLink::query()
            ->whereIn('document_id', $documentIds)
            ->selectRaw('document_id, state, COUNT(*) as aggregate')
            ->groupBy('document_id', 'state')
            ->get();

        foreach ($rows as $row) {
            $documentId = (int) $row->getAttribute('document_id');
            $state = (string) $row->getAttribute('state');
            if (! isset($counts[$documentId])) {
                continue;
            }
            $counts[$documentId][$state] = (int) $row->getAttribute('aggregate');
        }

        return $counts;
    }

    /**
     * @param  array<string, int>  $counts
     */
    private function hasBlockedLinkState(array $counts): bool
    {
        foreach ([
            FinLotReconciliationLink::STATE_BROKER_ONLY,
            FinLotReconciliationLink::STATE_ACCOUNT_ONLY,
            FinLotReconciliationLink::STATE_UNLINKED,
        ] as $state) {
            if (($counts[$state] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }
}
