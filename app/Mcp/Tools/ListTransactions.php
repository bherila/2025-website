<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Services\Finance\Agent\TransactionsQueryService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List financial transactions (line items) for one or all accounts. Supports filtering by account_id, year, tag label, and a result limit.')]
class ListTransactions extends Tool
{
    use AuthorizesFeatureAccess;

    public function __construct(
        private TransactionsQueryService $transactions,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.transactions.view')) !== null) {
            return $denied;
        }

        $accountId = $request->input('account_id');
        $limit = min((int) ($request->input('limit') ?? 100), 500);

        $query = $this->transactions->queryForUser(
            (int) Auth::id(),
            $accountId !== null ? (int) $accountId : null,
            $request->has('year') ? (int) $request->input('year') : null,
            $request->has('tag') ? (string) $request->input('tag') : null,
        );

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
