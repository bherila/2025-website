<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List financial transactions (line items) for one or all accounts. Supports filtering by account_id, year, tag label, and a result limit.')]
class ListTransactions extends Tool
{
    public function handle(Request $request): Response
    {
        $uid = Auth::id();
        $accountId = $request->input('account_id');
        $limit = min((int) ($request->input('limit') ?? 100), 500);

        if ($accountId !== null) {
            $account = FinAccounts::where('acct_id', (int) $accountId)
                ->where('acct_owner', $uid)
                ->firstOrFail();
            $query = FinAccountLineItems::where('t_account', $account->acct_id);
        } else {
            $accountIds = FinAccounts::where('acct_owner', $uid)->pluck('acct_id');
            $query = FinAccountLineItems::whereIn('t_account', $accountIds);
        }

        $query->with(['tags'])
            ->orderBy('t_date', 'desc');

        if ($request->has('year')) {
            $query->whereYear('t_date', (int) $request->input('year'));
        }

        if ($request->has('tag')) {
            $tagLabel = $request->input('tag');
            $query->whereHas('tags', fn ($q) => $q->where('fin_account_tag.tag_label', $tagLabel));
        }

        return Response::json($query->limit($limit)->get());
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'account_id' => $schema->integer()->description('Account ID; omit or pass null for all accounts')->nullable(),
            'year' => $schema->integer()->description('Filter to a specific tax year')->nullable(),
            'tag' => $schema->string()->description('Filter by tag label')->nullable(),
            'limit' => $schema->integer()->description('Maximum number of results (default 100, max 500)')->nullable(),
        ];
    }
}
