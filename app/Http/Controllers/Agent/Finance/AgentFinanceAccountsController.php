<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\Agent\AccountsQueryService;
use App\Support\Agent\AgentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/accounts — owner-scoped account list.
 *
 * Requires finance.accounts.basic; balance/detail fields are included only
 * when the context (user AND token scope) also passes finance.accounts.detail.
 * Account numbers are never exposed to agents.
 */
class AgentFinanceAccountsController extends Controller
{
    public function __construct(private readonly AccountsQueryService $accounts) {}

    public function __invoke(AgentContext $context): JsonResponse
    {
        $includeDetail = $context->can('finance.accounts.detail');

        $accounts = $this->accounts->listForUser(
            (int) Auth::id(),
            $includeDetail ? AccountsQueryService::DETAIL_COLUMNS : AccountsQueryService::BASIC_COLUMNS,
        );

        return response()->json([
            'include_detail' => $includeDetail,
            'accounts' => $accounts
                ->map(function (FinAccounts $account) use ($includeDetail): array {
                    $row = [
                        'acct_id' => $account->acct_id,
                        'acct_name' => $account->acct_name,
                        'acct_is_debt' => (bool) $account->acct_is_debt,
                        'acct_is_retirement' => (bool) $account->acct_is_retirement,
                        'when_closed' => $account->when_closed?->toDateString(),
                    ];

                    if ($includeDetail) {
                        $row += [
                            'acct_last_balance' => $account->acct_last_balance,
                            'acct_last_balance_date' => $account->acct_last_balance_date?->toDateString(),
                            'acct_sort_order' => $account->acct_sort_order,
                        ];
                    }

                    return $row;
                })
                ->values()
                ->all(),
        ]);
    }
}
