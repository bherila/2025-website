<?php

namespace App\Mcp\Tools\Career;

use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompInputs;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

#[Name('career_save_latest_comparison')]
#[Description('Save (upsert) the authenticated user\'s private latest Career Comparison from a full inputs object. Validates with the same rules as the web app and returns the saved inputs plus projection.')]
class SaveLatestComparison extends Tool implements RequiresFeature
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

        $validator = Validator::make(
            ['inputs' => $request->get('inputs')],
            ComputeCareerCompRequest::inputRules(),
        );

        if ($validator->fails()) {
            return Response::error('Invalid inputs: '.collect($validator->errors()->all())->take(10)->implode(' '));
        }

        $inputs = CareerCompInputs::fromArray($validator->validated()['inputs']);
        $comparison = $this->workflows->saveLatest((int) Auth::id(), $inputs);

        return Response::json($this->workflows->response($comparison));
    }

    /**
     * @return array<string, \Illuminate\JsonSchema\JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'inputs' => $schema->object()->description(
                'Full comparison inputs object: startYear, horizonYears, currentJobs[], hypotheticalJobs[], optional modelAssumptions. Same shape the web app saves.'
            ),
        ];
    }
}
