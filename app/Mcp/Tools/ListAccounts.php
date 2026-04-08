<?php

namespace App\Mcp\Tools;

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
    public function handle(Request $request): Response
    {
        $uid = Auth::id();

        $accounts = FinAccounts::where('acct_owner', $uid)
            ->whereNull('when_deleted')
            ->orderBy('when_closed', 'asc')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get();

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
