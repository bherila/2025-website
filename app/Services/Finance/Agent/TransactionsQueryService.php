<?php

namespace App\Services\Finance\Agent;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Database\Eloquent\Builder;

/**
 * Owner-scoped transaction queries shared by the MCP list_transactions tool
 * and the agent REST surface. Extracted behavior-preserving from
 * App\Mcp\Tools\ListTransactions.
 */
class TransactionsQueryService
{
    /**
     * Build the filtered, owner-scoped transactions query (newest first).
     *
     * @param  int|null  $accountId  When set, the account MUST belong to the
     *                               user — otherwise ModelNotFoundException (404).
     * @return Builder<FinAccountLineItems>
     */
    public function queryForUser(int $userId, ?int $accountId = null, ?int $year = null, ?string $tag = null): Builder
    {
        if ($accountId !== null) {
            $account = FinAccounts::where('acct_id', $accountId)
                ->where('acct_owner', $userId)
                ->firstOrFail();
            $query = FinAccountLineItems::where('t_account', $account->acct_id);
        } else {
            $accountIds = FinAccounts::where('acct_owner', $userId)->pluck('acct_id');
            $query = FinAccountLineItems::whereIn('t_account', $accountIds);
        }

        $query->with(['tags'])
            ->orderBy('t_date', 'desc')
            ->orderBy('t_id', 'desc');

        if ($year !== null) {
            $query->whereYear('t_date', $year);
        }

        if ($tag !== null) {
            $query->whereHas('tags', fn ($q) => $q->where('fin_account_tag.tag_label', $tag));
        }

        return $query;
    }
}
