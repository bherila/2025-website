<?php

namespace App\Services\Finance\Agent;

use App\Models\FinanceTool\FinAccounts;
use Illuminate\Database\Eloquent\Collection;

/**
 * Owner-scoped account queries shared by the MCP list_accounts tool and the
 * agent REST surface. Extracted behavior-preserving from App\Mcp\Tools\ListAccounts.
 */
class AccountsQueryService
{
    /** @var list<string> */
    public const BASIC_COLUMNS = ['acct_id', 'acct_name', 'acct_is_debt', 'acct_is_retirement', 'when_closed'];

    /** @var list<string> Detail adds balances and ordering metadata; acct_number is deliberately never exposed to agents. */
    public const DETAIL_COLUMNS = [
        'acct_id', 'acct_name', 'acct_is_debt', 'acct_is_retirement', 'when_closed',
        'acct_last_balance', 'acct_last_balance_date', 'acct_sort_order',
    ];

    /**
     * @param  list<string>  $columns
     * @return Collection<int, FinAccounts>
     */
    public function listForUser(int $userId, array $columns = self::BASIC_COLUMNS): Collection
    {
        return FinAccounts::where('acct_owner', $userId)
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get($columns);
    }

    /**
     * Accounts grouped into asset/liability/retirement buckets (MCP tool shape).
     *
     * @param  list<string>  $columns
     * @return array{assetAccounts: Collection<int, FinAccounts>, liabilityAccounts: Collection<int, FinAccounts>, retirementAccounts: Collection<int, FinAccounts>}
     */
    public function groupedForUser(int $userId, array $columns = self::BASIC_COLUMNS): array
    {
        $accounts = $this->listForUser($userId, $columns);

        return [
            'assetAccounts' => $accounts->filter(fn (FinAccounts $a) => ! $a->acct_is_debt && ! $a->acct_is_retirement)->values(),
            'liabilityAccounts' => $accounts->filter(fn (FinAccounts $a) => $a->acct_is_debt && ! $a->acct_is_retirement)->values(),
            'retirementAccounts' => $accounts->filter(fn (FinAccounts $a) => ! $a->acct_is_debt && $a->acct_is_retirement)->values(),
        ];
    }
}
