<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\FeeAnalyticsService;
use App\Services\Finance\MoneyMath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceFeesController extends Controller
{
    public function show(Request $request, int $account_id, FeeAnalyticsService $fees): JsonResponse
    {
        $validated = $request->validate([
            'year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
        ]);

        $year = (int) ($validated['year'] ?? now()->year);
        $account = FinAccounts::query()
            ->where('acct_id', $account_id)
            ->where('acct_owner', Auth::id())
            ->firstOrFail();

        return response()->json($this->accountPayload($account, $year, $fees, true));
    }

    public function all(Request $request, FeeAnalyticsService $fees): JsonResponse
    {
        $validated = $request->validate([
            'year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
        ]);

        $year = (int) ($validated['year'] ?? now()->year);
        $accounts = FinAccounts::query()
            ->where('acct_owner', Auth::id())
            ->orderBy('when_closed')
            ->orderBy('acct_sort_order')
            ->orderBy('acct_name')
            ->get();

        $totals = ['fee_schE' => 0.0, 'fee_irc67g' => 0.0, 'untagged' => 0.0];
        $accountRows = [];
        $reconciliationRows = [];
        $accountIds = $accounts
            ->pluck('acct_id')
            ->map(static fn (mixed $accountId): int => (int) $accountId)
            ->all();

        foreach ($accounts as $account) {
            $payload = $this->accountPayload($account, $year, $fees, false, false, false);
            $accountRows[] = $payload['summary'];

            foreach ($payload['actual']['by_characteristic'] as $bucket => $amount) {
                $totals[$bucket] = MoneyMath::add($totals[$bucket], (float) $amount);
            }

            foreach ($fees->reconcileK1Fees((int) $account->acct_id, $year, $payload['actual']) as $row) {
                $reconciliationRows[] = $row + [
                    'account_name' => $account->acct_name,
                    'account_url' => "/finance/account/{$account->acct_id}/fees?year={$year}",
                ];
            }
        }

        return response()->json([
            'year' => $year,
            'totals' => [
                'total' => MoneyMath::sum(array_values($totals)),
                'by_characteristic' => $totals,
            ],
            'accounts' => $accountRows,
            'monthly_fee_drag' => $fees->monthlyFeeDragSeriesForAccounts($accountIds, $year),
            'reconciliation_summary' => [
                'matched' => count(array_filter($reconciliationRows, static fn (array $row): bool => $row['status'] === 'match')),
                'mismatched' => count(array_filter($reconciliationRows, static fn (array $row): bool => $row['status'] === 'mismatch')),
                'unclassified' => count(array_filter($reconciliationRows, static fn (array $row): bool => $row['status'] === 'unclassified')),
                'unlinked' => $this->unlinkedK1Count($year),
            ],
            'reconciliation' => $reconciliationRows,
            'constants' => [
                'mismatch_threshold_usd' => FeeAnalyticsService::MISMATCH_THRESHOLD_USD,
                'on_target_tolerance' => FeeAnalyticsService::ON_TARGET_TOLERANCE,
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function accountPayload(
        FinAccounts $account,
        int $year,
        FeeAnalyticsService $fees,
        bool $includeLineItems,
        bool $includeMonthlyFeeDrag = true,
        bool $includeReconciliation = true,
    ): array {
        $actual = $fees->actualFeesForAccount($account, $year);
        $expected = $fees->expectedFeesForAccount($account, $year);
        $hasExpectation = $fees->accountHasExpectedFees($account);
        $delta = MoneyMath::subtract($actual['total'], $expected);
        $balance = (float) ($account->acct_last_balance ?? 0);

        $summary = [
            'acct_id' => (int) $account->acct_id,
            'acct_name' => (string) $account->acct_name,
            'balance' => $balance,
            'expected_fees' => $expected,
            'has_expectation' => $hasExpectation,
            'actual_fees' => $actual['total'],
            'delta' => $delta,
            'status' => $fees->deltaStatus($actual['total'], $expected, $hasExpectation),
            'pct_of_balance' => abs($balance) > 0 ? round(($actual['total'] / abs($balance)) * 100, 4) : null,
            'fees_url' => "/finance/account/{$account->acct_id}/fees?year={$year}",
        ];

        return [
            'year' => $year,
            'account' => [
                'acct_id' => (int) $account->acct_id,
                'acct_name' => (string) $account->acct_name,
                'acct_last_balance' => $balance,
                'expected_fee_pct' => $account->expected_fee_pct !== null ? (float) $account->expected_fee_pct : null,
                'expected_fee_flat' => $account->expected_fee_flat !== null ? (float) $account->expected_fee_flat : null,
                'expected_fee_notes' => $account->expected_fee_notes,
            ],
            'actual' => [
                'total' => $actual['total'],
                'by_characteristic' => $actual['by_characteristic'],
                'line_items' => $includeLineItems ? $actual['line_items'] : [],
            ],
            'expected' => [
                'total' => $expected,
                'has_expectation' => $hasExpectation,
            ],
            'delta' => $delta,
            'status' => $summary['status'],
            'monthly_fee_drag' => $includeMonthlyFeeDrag ? $fees->monthlyFeeDragSeries((int) $account->acct_id, $year) : [],
            'reconciliation' => $includeReconciliation ? $fees->reconcileK1Fees((int) $account->acct_id, $year, $actual) : [],
            'summary' => $summary,
            'constants' => [
                'mismatch_threshold_usd' => FeeAnalyticsService::MISMATCH_THRESHOLD_USD,
                'on_target_tolerance' => FeeAnalyticsService::ON_TARGET_TOLERANCE,
            ],
        ];
    }

    private function unlinkedK1Count(int $year): int
    {
        return FileForTaxDocument::query()
            ->where('user_id', Auth::id())
            ->where('tax_year', $year)
            ->where('form_type', 'k1')
            ->whereDoesntHave('accountLinks')
            ->count();
    }
}
