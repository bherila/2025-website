<?php

namespace App\Mcp\Tools\Career;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

#[Name('career_import_rsu')]
#[Description('Build a Career Comparison currentJob spec from the authenticated user\'s equity awards (RSU grants and vest schedule). Read-only: nothing is persisted until the returned inputs are saved.')]
class ImportRsu extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.rsu.view';
    }

    public function __construct(
        private CareerComparisonWorkflowService $workflows,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.rsu.view')) !== null) {
            return $denied;
        }

        $currentJob = $request->get('currentJob');

        return Response::json($this->workflows->importRsuCurrentJob(
            (int) Auth::id(),
            is_array($currentJob) ? $currentJob : null,
        ));
    }

    /**
     * @return array<string, \Illuminate\JsonSchema\JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'currentJob' => $schema->object()->description(
                'Optional existing currentJob spec to merge the imported RSU grants into; omit to start from defaults.'
            ),
        ];
    }
}
