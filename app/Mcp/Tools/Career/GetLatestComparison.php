<?php

namespace App\Mcp\Tools\Career;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Models\CareerComparison;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

#[Name('career_get_latest_comparison')]
#[Description('Get the authenticated user\'s private latest Career Comparison (inputs and projection), or workflow: null when none exists.')]
class GetLatestComparison extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'financial-planning.career-comparison.private';
    }

    public function __construct(
        private CareerComparisonWorkflowService $workflows,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('financial-planning.career-comparison.private')) !== null) {
            return $denied;
        }

        $latest = $this->workflows->latestForUser((int) Auth::id());

        if (! $latest instanceof CareerComparison) {
            return Response::json(['workflow' => null]);
        }

        return Response::json(['workflow' => $this->workflows->response($latest)]);
    }

    /**
     * @return array<string, \Illuminate\JsonSchema\JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
