<?php

namespace App\Http\Controllers\FinanceTool\Concerns;

use App\Models\FinanceTool\FinAccounts;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * Shared account-scoping helpers for Finance controllers.
 *
 * Both methods scope queries to the authenticated user via Auth::id().
 * Use these in any controller that reads or writes Finance account data
 * to avoid repeating the ownership check inline.
 */
trait QueriesUserAccounts
{
    /**
     * Resolve a FinAccounts record owned by the authenticated user.
     *
     * Aborts with 404 if the account does not exist or belongs to a different user.
     */
    protected function resolveOwnedAccount(int|string $accountId): FinAccounts
    {
        return FinAccounts::where('acct_id', $accountId)
            ->where('acct_owner', Auth::id())
            ->firstOrFail();
    }

    /**
     * Return the IDs of all accounts owned by the authenticated user.
     *
     * @return Collection<int, int>
     */
    protected function getUserAccountIds(): Collection
    {
        return FinAccounts::where('acct_owner', Auth::id())->pluck('acct_id');
    }
}
