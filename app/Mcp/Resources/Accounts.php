<?php

namespace App\Mcp\Resources;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Uri('finance://accounts')]
#[Description('Complete list of financial accounts with metadata (type, balance, status). Use the list_accounts tool for structured queries.')]
class Accounts extends Resource
{
    use AuthorizesFeatureAccess;

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.accounts.basic')) !== null) {
            return $denied;
        }

        $accounts = FinAccounts::where('acct_owner', Auth::id())
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get(['acct_id', 'acct_name', 'acct_is_debt', 'acct_is_retirement', 'when_closed']);

        return Response::json($accounts);
    }
}
