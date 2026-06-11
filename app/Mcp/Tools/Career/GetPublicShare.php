<?php

namespace App\Mcp\Tools\Career;

use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Models\CareerComparison;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\ComparisonSharePresenter;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

#[Name('career_get_public_share')]
#[Description('Read a public Career Comparison share by its short code. Read-only; confidential current-job data is redacted for non-creators; expired or unknown codes return an error.')]
class GetPublicShare extends Tool implements RequiresFeature
{
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return null;
    }

    public function __construct(
        private CareerComparisonWorkflowService $workflows,
        private ComparisonSharePresenter $sharePresenter,
    ) {}

    public function handle(Request $request): Response
    {
        $code = trim((string) $request->get('code'));

        if ($code === '') {
            return Response::error('A share code is required.');
        }

        $share = $this->workflows->findActiveShare($code);

        if (! $share instanceof CareerComparison) {
            return Response::error('Share not found or expired.');
        }

        $isCreator = Auth::id() !== null && $share->user_id !== null && (int) Auth::id() === (int) $share->user_id;

        return Response::json($this->sharePresenter->shareResponse($share, $isCreator));
    }

    /**
     * @return array<string, \Illuminate\JsonSchema\JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'code' => $schema->string()->description('Share short code from the share URL'),
        ];
    }
}
