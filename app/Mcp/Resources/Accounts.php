<?php

namespace App\Mcp\Resources;

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
    public function handle(Request $request): Response
    {
        $accounts = FinAccounts::where('acct_owner', Auth::id())
            ->whereNull('when_deleted')
            ->orderBy('acct_sort_order', 'asc')
            ->orderBy('acct_name', 'asc')
            ->get();

        return Response::json($accounts);
    }
}
