<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get the marriage status by year for the authenticated user (used for filing status determination).')]
class GetMarriageStatus extends Tool
{
    use AuthorizesFeatureAccess;

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.tax-preview.view')) !== null) {
            return $denied;
        }

        $status = Auth::user()->marriage_status_by_year ?? [];

        return Response::json($status);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
