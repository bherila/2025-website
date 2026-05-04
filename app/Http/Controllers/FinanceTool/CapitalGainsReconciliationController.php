<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\CapitalGains\CanonicalCapitalGainTransaction;
use App\Services\Finance\CapitalGains\CapitalGainsImportNormalizer;
use App\Services\Finance\CapitalGains\Form8949ReportBuilder;
use App\Services\Finance\CapitalGains\TaxLotReconciliationEngine;
use App\Services\Finance\CapitalGains\WashSaleAnalysisEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * API controller for the Capital Gains Reconciliation workflow.
 *
 * Exposes three data endpoints consumed by CapitalGainsReconciliationPanel:
 *   GET /api/finance/capital-gains/reconciliation  — lot reconciliation (delegates to TaxLotReconciliationEngine)
 *   GET /api/finance/capital-gains/wash-sales      — cross-account wash-sale analysis
 *   GET /api/finance/capital-gains/form-8949       — Form 8949 report rows
 */
class CapitalGainsReconciliationController extends Controller
{
    public function __construct(
        private readonly TaxLotReconciliationEngine $reconciliationEngine,
        private readonly WashSaleAnalysisEngine $washSaleEngine,
        private readonly Form8949ReportBuilder $reportBuilder,
    ) {}

    /**
     * Return lot-level reconciliation data (1099-B vs. account lots).
     *
     * Query parameters:
     *   tax_year   int  required  Tax year to analyse
     *   account_id int  optional  Restrict to a specific account
     */
    public function reconciliation(Request $request): JsonResponse
    {
        $request->validate([
            'tax_year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'account_id' => ['nullable', 'integer'],
        ]);

        $userId = (int) Auth::id();
        $taxYear = (int) $request->input('tax_year');
        $accountId = $request->filled('account_id') ? (int) $request->input('account_id') : null;

        $result = $this->reconciliationEngine->reconcile($userId, $taxYear, $accountId);

        return response()->json($result);
    }

    /**
     * Return cross-account wash-sale analysis results.
     *
     * Query parameters:
     *   tax_year  int  required  Tax year to analyse
     */
    public function washSales(Request $request): JsonResponse
    {
        $request->validate([
            'tax_year' => ['required', 'integer', 'min:2000', 'max:2100'],
        ]);

        $userId = (int) Auth::id();
        $taxYear = (int) $request->input('tax_year');

        $accountIds = FinAccounts::forOwner($userId)
            ->pluck('acct_id')
            ->map(static fn (int|string $id): int => (int) $id)
            ->values()
            ->all();

        $adjustments = $this->washSaleEngine->analyze($accountIds, $taxYear);

        $payload = array_map(fn ($adj): array => [
            'id' => $adj->id,
            'loss_sale_id' => $adj->lossSaleId,
            'replacement_purchase_id' => $adj->replacementPurchaseId,
            'symbol' => $adj->symbol,
            'sale_date' => $adj->saleDateStr,
            'replacement_date' => $adj->replacementDateStr,
            'disallowed_loss' => $adj->disallowedLoss,
            'sale_account_id' => $adj->saleAccountId,
            'sale_account_name' => $adj->saleAccountName,
            'replacement_account_id' => $adj->replacementAccountId,
            'replacement_account_name' => $adj->replacementAccountName,
            'is_cross_account' => $adj->isCrossAccount,
            'reason' => $adj->reason,
            'sale_lot_id' => $adj->saleLotId,
            'replacement_lot_id' => $adj->replacementLotId,
        ], $adjustments);

        return response()->json([
            'tax_year' => $taxYear,
            'total' => count($adjustments),
            'cross_account_count' => count(array_filter($adjustments, fn ($a) => $a->isCrossAccount)),
            'same_account_count' => count(array_filter($adjustments, fn ($a) => ! $a->isCrossAccount)),
            'adjustments' => $payload,
        ]);
    }

    /**
     * Return Form 8949 report rows and Schedule D rollup inputs.
     *
     * Query parameters:
     *   tax_year        int     required  Tax year to analyse
     *   reporting_mode  string  optional  schedule_d_summary|form_8949_summary|form_8949_transactions (default: form_8949_transactions)
     */
    public function form8949(Request $request): JsonResponse
    {
        $request->validate([
            'tax_year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'reporting_mode' => ['nullable', 'string', 'in:schedule_d_summary,form_8949_summary,form_8949_transactions'],
        ]);

        $userId = (int) Auth::id();
        $taxYear = (int) $request->input('tax_year');
        $reportingMode = (string) ($request->input('reporting_mode') ?? 'form_8949_transactions');

        $accountIds = FinAccounts::forOwner($userId)
            ->pluck('acct_id')
            ->map(static fn (int|string $id): int => (int) $id)
            ->values()
            ->all();

        // Get cross-account wash-sale adjustments to apply
        $adjustments = $this->washSaleEngine->analyze($accountIds, $taxYear);

        // Load canonical transactions from account lots
        $transactions = $this->loadCanonicalTransactions($accountIds, $taxYear);

        $rows = $this->reportBuilder->buildRows($transactions, $adjustments, $reportingMode);
        $scheduleDRollup = $this->reportBuilder->buildScheduleDRollup($transactions, $adjustments);

        $rowsPayload = array_map(fn ($row): array => [
            'form_8949_box' => $row->form8949Box,
            'description' => $row->description,
            'date_acquired' => $row->dateAcquired,
            'date_sold' => $row->dateSold,
            'proceeds' => $row->proceeds,
            'cost_basis' => $row->costBasis,
            'adjustment_code' => $row->adjustmentCode,
            'adjustment_amount' => $row->adjustmentAmount,
            'gain_or_loss' => $row->gainOrLoss,
            'is_short_term' => $row->isShortTerm,
            'is_covered' => $row->isCovered,
            'is_summary_row' => $row->isSummaryRow,
            'account_name' => $row->accountName,
            'tax_document_id' => $row->taxDocumentId,
            'source_transaction_id' => $row->sourceTransactionId,
        ], $rows);

        $rollupPayload = array_map(fn ($rollup): array => [
            'form_8949_box' => $rollup->form8949Box,
            'is_short_term' => $rollup->isShortTerm,
            'schedule_d_line' => $rollup->scheduleDLine,
            'total_proceeds' => $rollup->totalProceeds,
            'total_cost_basis' => $rollup->totalCostBasis,
            'total_adjustment' => $rollup->totalAdjustment,
            'net_gain_or_loss' => $rollup->netGainOrLoss,
            'row_count' => $rollup->rowCount,
        ], $scheduleDRollup);

        return response()->json([
            'tax_year' => $taxYear,
            'reporting_mode' => $reportingMode,
            'rows' => $rowsPayload,
            'schedule_d_rollup' => $rollupPayload,
        ]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Load closed account lots for the given accounts/year as canonical transactions.
     *
     * @param  int[]  $accountIds
     * @return CanonicalCapitalGainTransaction[]
     */
    private function loadCanonicalTransactions(array $accountIds, int $taxYear): array
    {
        if ($accountIds === []) {
            return [];
        }

        $normalizer = app(CapitalGainsImportNormalizer::class);

        $lots = FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->whereNull('superseded_by_lot_id')
            ->with(['account:acct_id,acct_name'])
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();

        $transactions = [];
        foreach ($lots as $lot) {
            $transactions[] = $normalizer->fromAccountLot($lot);
        }

        return $transactions;
    }
}
