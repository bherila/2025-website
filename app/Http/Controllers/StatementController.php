<?php

namespace App\Http\Controllers;

use App\Models\FinStatementDetail;
use App\Models\FinAccounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Http\Client\Pool;
use Throwable;

class StatementController extends Controller
{
    public function getDetails(Request $request, $snapshot_id)
    {
        $details = FinStatementDetail::where('snapshot_id', $snapshot_id)->get();
        $snapshot = DB::table('fin_account_balance_snapshot')->where('snapshot_id', $snapshot_id)->first();
        $account = DB::table('fin_accounts')->where('acct_id', $snapshot->acct_id)->first(); // Fetch account details

        return response()->json([
            'details' => $details,
            'account_id' => $snapshot->acct_id,
            'account_name' => $account->acct_name, // Add account name
        ]);
    }

    public function addFinAccountStatement(Request $request, $account_id)
    {
        $uid = Auth::id();
        $account = FinAccounts::where('acct_id', $account_id)->where('acct_owner', $uid)->firstOrFail();

        $request->validate([
            'balance' => 'required|string',
            'when_added' => 'required|date',
        ]);

        DB::table('fin_account_balance_snapshot')->insert([
            'acct_id' => $account->acct_id,
            'balance' => $request->balance,
            'when_added' => $request->when_added,
        ]);

        return response()->json(['success' => true]);
    }

    public function updateFinAccountStatement(Request $request, $snapshot_id)
    {
        $uid = Auth::id();

        $request->validate([
            'balance' => 'required|string',
        ]);

        $snapshot = DB::table('fin_account_balance_snapshot')
            ->where('snapshot_id', $snapshot_id)
            ->first();

        if (!$snapshot) {
            return response()->json(['error' => 'Snapshot not found'], 404);
        }

        $account = DB::table('fin_accounts')
            ->where('acct_id', $snapshot->acct_id)
            ->where('acct_owner', $uid)
            ->first();

        if (!$account) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        DB::table('fin_account_balance_snapshot')
            ->where('snapshot_id', $snapshot_id)
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
            ->join('fin_account_balance_snapshot as fabs', 'fsd.snapshot_id', '=', 'fabs.snapshot_id')
            ->where('fabs.acct_id', $account->acct_id)
            ->select(
                'fabs.when_added',
                'fsd.section',
                'fsd.line_item',
                'fsd.statement_period_value',
                'fsd.ytd_value',
                'fsd.is_percentage'
            )
            ->orderBy('fabs.when_added', 'desc')
            ->orderBy('fabs.snapshot_id', 'asc')
            ->orderBy('fsd.section')
            ->orderBy('fsd.line_item')
            ->get();

        $dates = array_unique(array_map(function ($detail) {
            return substr($detail->when_added, 0, 10);
        }, $details->toArray()));
        sort($dates);

        $groupedData = [];
        foreach ($details as $detail) {
            $date = substr($detail->when_added, 0, 10);
            $section = $detail->section;
            $lineItem = $detail->line_item;

            if (!isset($groupedData[$section])) {
                $groupedData[$section] = [];
            }
            if (!isset($groupedData[$section][$lineItem])) {
                $groupedData[$section][$lineItem] = [
                    'is_percentage' => (bool)$detail->is_percentage,
                    'values' => [],
                    'last_ytd_value' => (float)$detail->ytd_value,
                ];
            }
            $groupedData[$section][$lineItem]['values'][$date] = (float)$detail->statement_period_value;
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
            'statement.info.periodEnd' => 'nullable|string',
            'statement.totalNav' => 'nullable|numeric',
            'statement.nav' => 'nullable|array',
            'statement.cashReport' => 'nullable|array',
            'statement.positions' => 'nullable|array',
            'statement.performance' => 'nullable|array',
        ]);

        $statement = $request->statement;
        $periodEnd = $statement['info']['periodEnd'] ?? now()->format('Y-m-d');
        $totalNav = $statement['totalNav'] ?? null;

        // Create the snapshot record
        $snapshotId = DB::table('fin_account_balance_snapshot')->insertGetId([
            'acct_id' => $account->acct_id,
            'balance' => $totalNav,
            'when_added' => $periodEnd,
        ]);

        // Insert NAV rows
        if (!empty($statement['nav'])) {
            $navRows = array_map(function ($row) use ($snapshotId) {
                return [
                    'snapshot_id' => $snapshotId,
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
        if (!empty($statement['cashReport'])) {
            $cashRows = array_map(function ($row) use ($snapshotId) {
                return [
                    'snapshot_id' => $snapshotId,
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
        if (!empty($statement['positions'])) {
            $positionRows = array_map(function ($row) use ($snapshotId) {
                return [
                    'snapshot_id' => $snapshotId,
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
        if (!empty($statement['performance'])) {
            $perfRows = array_map(function ($row) use ($snapshotId) {
                return [
                    'snapshot_id' => $snapshotId,
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
            'snapshot_id' => $snapshotId,
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
     * Creates a snapshot and adds statement details to it.
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
        
        $periodEnd = $statementInfo['periodEnd'] ?? now()->format('Y-m-d');
        $closingBalance = $statementInfo['closingBalance'] ?? null;

        // Create the snapshot record
        $snapshotId = DB::table('fin_account_balance_snapshot')->insertGetId([
            'acct_id' => $account->acct_id,
            'balance' => $closingBalance,
            'when_added' => $periodEnd,
        ]);

        // Insert statement detail rows
        if (!empty($statementDetails)) {
            $detailRows = array_map(function ($row) use ($snapshotId) {
                return [
                    'snapshot_id' => $snapshotId,
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
            'snapshot_id' => $snapshotId,
            'period_end' => $periodEnd,
            'closing_balance' => $closingBalance,
            'details_count' => count($statementDetails),
        ]);
    }
}
