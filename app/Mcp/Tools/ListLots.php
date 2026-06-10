<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Services\Finance\Agent\LotsQueryService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List investment lots. Pass as_of=YYYY-12-31 to get lots held at year-end. Optionally filter by account_id.')]
class ListLots extends Tool
{
    use AuthorizesFeatureAccess;

    public function __construct(
        private LotsQueryService $lots,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.lots.view')) !== null) {
            return $denied;
        }

        $accountId = $request->input('account_id');
        $asOf = $request->input('as_of');

        $lots = $this->lots->listForUser(
            (int) Auth::id(),
            $accountId !== null ? (int) $accountId : null,
            $asOf ? (string) $asOf : null,
        );

        return Response::json(['lots' => $lots]);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'as_of' => $schema->string()->description('Date string YYYY-MM-DD (e.g. 2024-12-31) — returns lots held on that date')->nullable(),
            'account_id' => $schema->integer()->description('Optional account ID to filter lots')->nullable(),
        ];
    }
}
