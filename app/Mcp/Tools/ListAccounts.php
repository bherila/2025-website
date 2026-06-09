<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List financial accounts for the authenticated user, grouped into asset, liability, and retirement accounts.')]
class ListAccounts extends Tool
{
    use AuthorizesFeatureAccess;

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.accounts.basic')) !== null) {
            return $denied;
        }

        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get(['acct_id', 'acct_name', 'acct_is_debt', 'acct_is_retirement', 'when_closed']);

        $assetAccounts = $accounts->filter(fn ($a) => ! $a->acct_is_debt && ! $a->acct_is_retirement)->values();
        $liabilityAccounts = $accounts->filter(fn ($a) => $a->acct_is_debt && ! $a->acct_is_retirement)->values();
        $retirementAccounts = $accounts->filter(fn ($a) => ! $a->acct_is_debt && $a->acct_is_retirement)->values();

        return Response::json([
            'assetAccounts' => $assetAccounts,
            'liabilityAccounts' => $liabilityAccounts,
            'retirementAccounts' => $retirementAccounts,
        ]);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
