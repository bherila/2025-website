<?php

namespace App\Mcp\Resources;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Models\FinanceTool\FinEmploymentEntity;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Uri('finance://employment-entities')]
#[Description('All employment entities for the authenticated user: W-2 employers, Schedule C businesses, and related entities.')]
class EmploymentEntities extends Resource implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.tax-preview.view';
    }

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.tax-preview.view')) !== null) {
            return $denied;
        }

        $entities = FinEmploymentEntity::where('user_id', Auth::id())
            ->orderBy('start_date', 'desc')
            ->get();

        return Response::json($entities);
    }
}
