<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Services\Finance\Agent\AccountsQueryService;
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

    public function __construct(
        private AccountsQueryService $accounts,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.accounts.basic')) !== null) {
            return $denied;
        }

        return Response::json($this->accounts->groupedForUser((int) Auth::id()));
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
