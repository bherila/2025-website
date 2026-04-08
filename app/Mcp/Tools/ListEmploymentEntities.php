<?php

namespace App\Mcp\Tools;

use App\Models\FinanceTool\FinEmploymentEntity;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('List all employment entities for the authenticated user (W-2 employers, Schedule C businesses, etc.).')]
class ListEmploymentEntities extends Tool
{
    public function handle(Request $request): Response
    {
        $entities = FinEmploymentEntity::where('user_id', Auth::id())
            ->orderBy('start_date', 'desc')
            ->get();

        return Response::json($entities);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
