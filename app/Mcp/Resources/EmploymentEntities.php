<?php

namespace App\Mcp\Resources;

use App\Models\FinanceTool\FinEmploymentEntity;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Uri('finance://employment-entities')]
#[Description('All employment entities for the authenticated user: W-2 employers, Schedule C businesses, and related entities.')]
class EmploymentEntities extends Resource
{
    public function handle(Request $request): Response
    {
        $entities = FinEmploymentEntity::where('user_id', Auth::id())
            ->orderBy('start_date', 'desc')
            ->get();

        return Response::json($entities);
    }
}
