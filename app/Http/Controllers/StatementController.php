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
    }}
