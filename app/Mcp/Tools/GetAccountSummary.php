<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get a summary of an account including transaction totals, per-symbol breakdown, and monthly totals. Optionally filter by year.')]
class GetAccountSummary extends Tool
{
    public function handle(Request $request): Response
    {
        $uid = Auth::id();
        $accountId = (int) $request->input('account_id');

        $account = FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', $uid)
            ->firstOrFail();

        $lineItemsQuery = FinAccountLineItems::where('t_account', $accountId)
            ->whereNull('when_deleted');

        $year = $request->input('year');
        if ($year !== null && $year !== 'all') {
            $lineItemsQuery->whereYear('t_date', (int) $year);
        }

        $totals = [
            'total_volume' => (clone $lineItemsQuery)->sum(DB::raw('ABS(t_amt)')),
            'total_commission' => (clone $lineItemsQuery)->sum('t_commission'),
            'total_fee' => (clone $lineItemsQuery)->sum('t_fee'),
        ];

        $symbolQuery = FinAccountLineItems::where('t_account', $accountId)
            ->whereNull('when_deleted')
            ->whereNotNull('t_symbol');

        if ($year !== null && $year !== 'all') {
            $symbolQuery->whereYear('t_date', (int) $year);
        }

        $symbolSummary = $symbolQuery
            ->select('t_symbol', DB::raw('SUM(t_amt) as total_amount'))
            ->groupBy('t_symbol')
            ->orderByRaw('SUM(t_amt) DESC')
            ->get()
            ->toArray();

        return Response::json([
            'account' => $account,
            'totals' => $totals,
            'symbolSummary' => $symbolSummary,
        ]);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'account_id' => $schema->integer()->description('Account ID'),
            'year' => $schema->integer()->description('Optional year filter')->nullable(),
        ];
    }
}
