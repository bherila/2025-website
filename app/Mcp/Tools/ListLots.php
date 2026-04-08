<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List investment lots. Pass as_of=YYYY-12-31 to get lots held at year-end. Optionally filter by account_id.')]
class ListLots extends Tool
{
    public function handle(Request $request): Response
    {
        $uid = Auth::id();
        $accountId = $request->input('account_id');

        if ($accountId) {
            $accountIds = FinAccounts::where('acct_owner', $uid)
                ->where('acct_id', (int) $accountId)
                ->pluck('acct_id');
        } else {
            $accountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');
        }

        $query = FinAccountLot::whereIn('acct_id', $accountIds)
            ->select(['acct_id', 'cost_basis', 'purchase_date', 'sale_date', 'symbol', 'quantity', 'cost_per_unit']);

        $asOf = $request->input('as_of');
        if ($asOf) {
            $query->where('purchase_date', '<=', $asOf)
                ->where(fn ($q) => $q->whereNull('sale_date')->orWhere('sale_date', '>', $asOf));
        } else {
            $query->whereNull('sale_date');
        }

        $lots = $query->orderBy('purchase_date', 'desc')->get();

        return Response::json(['lots' => $lots]);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'as_of' => $schema->string()->description('Date string YYYY-MM-DD (e.g. 2024-12-31) — returns lots held on that date')->nullable(),
            'account_id' => $schema->integer()->description('Optional account ID to filter lots')->nullable(),
        ];
    }
}
