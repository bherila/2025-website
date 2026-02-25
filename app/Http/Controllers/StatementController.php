<?php

namespace App\Http\Controllers;

use App\Models\FinAccounts;
use App\Models\FinStatementDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class StatementController extends Controller
{
    public function getDetails(Request $request, $statement_id)
    {
        $details = FinStatementDetail::where('statement_id', $statement_id)->get();
        $statement = DB::table('fin_statements')->where('statement_id', $statement_id)->first();
        $account = DB::table('fin_accounts')->where('acct_id', $statement->acct_id)->first();

        // Format response to match PdfStatementPreviewCard expected format
        return response()->json([
            'statementInfo' => [
                'brokerName' => $account->acct_name ?? null,
                'accountNumber' => $account->acct_number ?? null,
                'accountName' => $account->acct_name ?? null,
                'periodStart' => $statement->statement_opening_date,
                'periodEnd' => $statement->statement_closing_date,
                'closingBalance' => $statement->balance ? (float) $statement->balance : null,
            ],
            'statementDetails' => $details->map(function ($detail) {
                return [
                    'section' => $detail->section,
                    'line_item' => $detail->line_item,
                    'statement_period_value' => (float) $detail->statement_period_value,
                    'ytd_value' => (float) $detail->ytd_value,
                    'is_percentage' => (bool) $detail->is_percentage,
                ];
            })->toArray(),
        ]);
    }

    public function addFinAccountStatement(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'balance' => 'required|string',
            'statement_closing_date' => 'required|date',
            'statement_opening_date' => 'nullable|date',
        ]);

        DB::table('fin_statements')->insert([
            'acct_id' => $account->acct_id,
            'balance' => $request->balance,
            'statement_opening_date' => $request->statement_opening_date,
            'statement_closing_date' => $request->statement_closing_date,
        ]);

        return response()->json(['success' => true]);
    }

    public function updateFinAccountStatement(Request $request, $statement_id)
    {
        $uid = Auth::id();

        $request->validate([
            'balance' => 'required|string',
        ]);

        $statement = DB::table('fin_statements')
            ->where('statement_id', $statement_id)
            ->first();

        if (! $statement) {
            return response()->json(['error' => 'Statement not found'], 404);
        }

        $account = DB::table('fin_accounts')
            ->where('acct_id', $statement->acct_id)
            ->where('acct_owner', $uid)
            ->first();

        if (! $account) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        DB::table('fin_statements')
            ->where('statement_id', $statement_id)
            ->update([
                'balance' => $request->balance,
            ]);

        return response()->json(['success' => true]);
    }

    public function getFinStatementDetails(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $details = DB::table('fin_statement_details as fsd')
            ->join('fin_statements as fs', 'fsd.statement_id', '=', 'fs.statement_id')
            ->where('fs.acct_id', $account->acct_id)
            ->select(
                'fs.statement_closing_date',
                'fsd.section',
                'fsd.line_item',
                'fsd.statement_period_value',
                'fsd.ytd_value',
                'fsd.is_percentage'
            )
            ->orderBy('fs.statement_closing_date', 'desc')
            ->orderBy('fs.statement_id', 'asc')
            ->orderBy('fsd.section')
            ->orderBy('fsd.line_item')
            ->get();

        $dates = array_unique(array_map(function ($detail) {
            return $detail->statement_closing_date;
        }, $details->toArray()));
        sort($dates);

        $groupedData = [];
        foreach ($details as $detail) {
            $date = $detail->statement_closing_date;
            $section = $detail->section;
            $lineItem = $detail->line_item;

            if (! isset($groupedData[$section])) {
                $groupedData[$section] = [];
            }
            if (! isset($groupedData[$section][$lineItem])) {
                $groupedData[$section][$lineItem] = [
                    'is_percentage' => (bool) $detail->is_percentage,
                    'values' => [],
                    'last_ytd_value' => (float) $detail->ytd_value,
                ];
            }
            $groupedData[$section][$lineItem]['values'][$date] = (float) $detail->statement_period_value;
        }

        return response()->json([
            'dates' => $dates,
            'groupedData' => $groupedData,
        ]);
    }

    /**
     * Import IB statement data (NAV, positions, performance, etc.)
     */
    public function importIbStatement(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'statement' => 'required|array',
            'statement.info' => 'required|array',
            'statement.info.periodStart' => 'nullable|string',
            'statement.info.periodEnd' => 'nullable|string',
            'statement.totalNav' => 'nullable|numeric',
            'statement.nav' => 'nullable|array',
            'statement.cashReport' => 'nullable|array',
            'statement.positions' => 'nullable|array',
            'statement.performance' => 'nullable|array',
        ]);

        $statement = $request->statement;
        $periodStart = $statement['info']['periodStart'] ?? null;
        $periodEnd = $statement['info']['periodEnd'] ?? now()->format('Y-m-d');
        $totalNav = $statement['totalNav'] ?? null;

        // Create the statement record
        $statementId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $account->acct_id,
            'balance' => $totalNav,
            'statement_opening_date' => $periodStart,
            'statement_closing_date' => $periodEnd,
        ]);

        // Insert NAV rows
        if (! empty($statement['nav'])) {
            $navRows = array_map(function ($row) use ($statementId) {
                return [
                    'statement_id' => $statementId,
                    'asset_class' => $row['assetClass'] ?? '',
                    'prior_total' => $row['priorTotal'] ?? null,
                    'current_long' => $row['currentLong'] ?? null,
                    'current_short' => $row['currentShort'] ?? null,
                    'current_total' => $row['currentTotal'] ?? null,
                    'change_amount' => $row['changeAmount'] ?? null,
                ];
            }, $statement['nav']);
            DB::table('fin_statement_nav')->insert($navRows);
        }

        // Insert cash report rows
        if (! empty($statement['cashReport'])) {
            $cashRows = array_map(function ($row) use ($statementId) {
                return [
                    'statement_id' => $statementId,
                    'currency' => $row['currency'] ?? '',
                    'line_item' => $row['lineItem'] ?? '',
                    'total' => $row['total'] ?? null,
                    'securities' => $row['securities'] ?? null,
                    'futures' => $row['futures'] ?? null,
                ];
            }, $statement['cashReport']);
            DB::table('fin_statement_cash_report')->insert($cashRows);
        }

        // Insert position rows
        if (! empty($statement['positions'])) {
            $positionRows = array_map(function ($row) use ($statementId) {
                return [
                    'statement_id' => $statementId,
                    'asset_category' => $row['assetCategory'] ?? null,
                    'currency' => $row['currency'] ?? null,
                    'symbol' => $row['symbol'] ?? '',
                    'quantity' => $row['quantity'] ?? null,
                    'multiplier' => $row['multiplier'] ?? 1,
                    'cost_price' => $row['costPrice'] ?? null,
                    'cost_basis' => $row['costBasis'] ?? null,
                    'close_price' => $row['closePrice'] ?? null,
                    'market_value' => $row['marketValue'] ?? null,
                    'unrealized_pl' => $row['unrealizedPl'] ?? null,
                    'opt_type' => $row['optType'] ?? null,
                    'opt_strike' => $row['optStrike'] ?? null,
                    'opt_expiration' => $row['optExpiration'] ?? null,
                ];
            }, $statement['positions']);
            DB::table('fin_statement_positions')->insert($positionRows);
        }

        // Insert performance rows
        if (! empty($statement['performance'])) {
            $perfRows = array_map(function ($row) use ($statementId) {
                return [
                    'statement_id' => $statementId,
                    'perf_type' => $row['perfType'] ?? 'mtm',
                    'asset_category' => $row['assetCategory'] ?? null,
                    'symbol' => $row['symbol'] ?? '',
                    'prior_quantity' => $row['priorQuantity'] ?? null,
                    'current_quantity' => $row['currentQuantity'] ?? null,
                    'prior_price' => $row['priorPrice'] ?? null,
                    'current_price' => $row['currentPrice'] ?? null,
                    'mtm_pl_position' => $row['mtmPlPosition'] ?? null,
                    'mtm_pl_transaction' => $row['mtmPlTransaction'] ?? null,
                    'mtm_pl_commissions' => $row['mtmPlCommissions'] ?? null,
                    'mtm_pl_other' => $row['mtmPlOther'] ?? null,
                    'mtm_pl_total' => $row['mtmPlTotal'] ?? null,
                    'cost_adj' => $row['costAdj'] ?? null,
                    'realized_st_profit' => $row['realizedStProfit'] ?? null,
                    'realized_st_loss' => $row['realizedStLoss'] ?? null,
                    'realized_lt_profit' => $row['realizedLtProfit'] ?? null,
                    'realized_lt_loss' => $row['realizedLtLoss'] ?? null,
                    'realized_total' => $row['realizedTotal'] ?? null,
                    'unrealized_st_profit' => $row['unrealizedStProfit'] ?? null,
                    'unrealized_st_loss' => $row['unrealizedStLoss'] ?? null,
                    'unrealized_lt_profit' => $row['unrealizedLtProfit'] ?? null,
                    'unrealized_lt_loss' => $row['unrealizedLtLoss'] ?? null,
                    'unrealized_total' => $row['unrealizedTotal'] ?? null,
                    'total_pl' => $row['totalPl'] ?? null,
                ];
            }, $statement['performance']);
            DB::table('fin_statement_performance')->insert($perfRows);
        }

        return response()->json([
            'success' => true,
            'statement_id' => $statementId,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'total_nav' => $totalNav,
            'nav_count' => count($statement['nav'] ?? []),
            'cash_report_count' => count($statement['cashReport'] ?? []),
            'positions_count' => count($statement['positions'] ?? []),
            'performance_count' => count($statement['performance'] ?? []),
        ]);
    }

    /**
     * Import statement details from PDF parsing (MTD/YTD line items).
     * Creates a statement record and adds statement details to it.
     */
    public function importPdfStatement(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'statementInfo' => 'nullable|array',
            'statementInfo.periodStart' => 'nullable|string',
            'statementInfo.periodEnd' => 'nullable|string',
            'statementInfo.closingBalance' => 'nullable|numeric',
            'statementDetails' => 'nullable|array',
            'statementDetails.*.section' => 'required|string',
            'statementDetails.*.line_item' => 'required|string',
            'statementDetails.*.statement_period_value' => 'nullable|numeric',
            'statementDetails.*.ytd_value' => 'nullable|numeric',
            'statementDetails.*.is_percentage' => 'nullable|boolean',
        ]);

        $statementInfo = $request->statementInfo ?? [];
        $statementDetails = $request->statementDetails ?? [];

        // truncate to date-only strings (YYYY-MM-DD) to avoid timezone artifacts
        $periodStart = isset($statementInfo['periodStart']) ? substr($statementInfo['periodStart'], 0, 10) : null;
        $periodEnd = isset($statementInfo['periodEnd']) ? substr($statementInfo['periodEnd'], 0, 10) : now()->format('Y-m-d');
        $closingBalance = $statementInfo['closingBalance'] ?? null;

        // Create the statement record
        $statementId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $account->acct_id,
            'balance' => $closingBalance,
            'statement_opening_date' => $periodStart,
            'statement_closing_date' => $periodEnd,
        ]);

        // Insert statement detail rows
        if (! empty($statementDetails)) {
            $detailRows = array_map(function ($row) use ($statementId) {
                return [
                    'statement_id' => $statementId,
                    'section' => $row['section'] ?? '',
                    'line_item' => $row['line_item'] ?? '',
                    'statement_period_value' => $row['statement_period_value'] ?? 0,
                    'ytd_value' => $row['ytd_value'] ?? 0,
                    'is_percentage' => $row['is_percentage'] ?? false,
                ];
            }, $statementDetails);
            FinStatementDetail::insert($detailRows);
        }

        return response()->json([
            'success' => true,
            'statement_id' => $statementId,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'closing_balance' => $closingBalance,
            'details_count' => count($statementDetails),
        ]);
    }
}
