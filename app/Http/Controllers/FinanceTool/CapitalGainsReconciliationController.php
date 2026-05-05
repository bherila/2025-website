<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
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
        private readonly CapitalGainsTaxReportService $capitalGainsTaxReportService,
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

        return response()->json([
            'tax_year' => $taxYear,
            'total' => count($adjustments),
            'cross_account_count' => count(array_filter($adjustments, fn ($a) => $a->isCrossAccount)),
            'same_account_count' => count(array_filter($adjustments, fn ($a) => ! $a->isCrossAccount)),
            'adjustments' => $this->capitalGainsTaxReportService->adjustmentsPayload($adjustments),
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

        $report = $this->capitalGainsTaxReportService->reportForUserYear($userId, $taxYear, $reportingMode);

        return response()->json([
            'tax_year' => $taxYear,
            'reporting_mode' => $reportingMode,
            'rows' => $this->capitalGainsTaxReportService->rowsPayload($report['rows']),
            'schedule_d_rollup' => $this->capitalGainsTaxReportService->rollupPayload($report['scheduleDRollup']),
        ]);
    }
}
