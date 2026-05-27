<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotReconciliationService;
use Illuminate\Database\Eloquent\Builder;

class ReadinessSummaryService
{
    public function __construct(
        private readonly LotReconciliationService $lotReconciliationService,
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    /**
     * Fast, cacheable readiness summary for Tax Preview home view.
     *
     * Returns compact counts aggregated from:
     * - Document counts by kind (W-2, 1099, K-1, etc.)
     * - Pending review count
     * - Missing account count (1099-B docs without linked accounts)
     * - Reconciliation health (per-document status → ok / drift / blocked)
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
        $lastMatcherRunAt = $this->lastMatcherRunAt($userId, $year);

        return [
            'year' => $year,
            'documents_by_kind' => $documentsByKind,
            'pending_review_count' => $pendingReviewCount,
            'missing_account_count' => $missingAccountCount,
            'reconciliation_health' => $reconciliationHealth,
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
        $reconciliation = $this->lotReconciliationService->reconcileYear($userId, $year);
        $documents = $reconciliation->documents();

        $health = [
            'ok' => 0,
            'drift' => 0,
            'blocked' => 0,
        ];

        foreach ($documents as $document) {
            $dashboardStatus = (string) ($document['dashboard_status'] ?? 'in_sync');

            if ($dashboardStatus === 'in_sync') {
                $health['ok']++;
            } elseif ($dashboardStatus === 'drift') {
                $health['drift']++;
            } else {
                // needs_review or any other status → blocked
                $health['blocked']++;
            }
        }

        return $health;
    }

    private function lastMatcherRunAt(int $userId, int $year): ?string
    {
        // Find the most recent last_matched_at across all accounts active in this year
        $accounts = FinAccounts::forOwner($userId)->pluck('acct_id')->all();

        if ($accounts === []) {
            return null;
        }

        $timestamps = [];
        foreach ($accounts as $accountId) {
            $timestamp = $this->lotMatcherService->lastMatchedAtForAccount((int) $accountId);
            if ($timestamp !== null) {
                $timestamps[] = $timestamp;
            }
        }

        if ($timestamps === []) {
            return null;
        }

        rsort($timestamps);

        return $timestamps[0];
    }
}
