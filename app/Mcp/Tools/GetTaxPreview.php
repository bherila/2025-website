<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\AuthorizesFeatureAccess;
use App\Mcp\Support\FiltersByFeature;
use App\Mcp\Support\RequiresFeature;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get the full tax preview dataset for a given year, including W-2s, 1099s, Schedule C, capital gains, Form 1116 foreign tax data, action items, and backend tax fact source lines. For payslip data use the list_payslips tool.')]
class GetTaxPreview extends Tool implements RequiresFeature
{
    use AuthorizesFeatureAccess;
    use FiltersByFeature;

    public static function requiredFeature(): ?string
    {
        return 'finance.tax-preview.view';
    }

    public function __construct(
        private TaxPreviewDataService $service,
    ) {}

    public function handle(Request $request): Response
    {
        if (($denied = $this->requireFeaturePermission('finance.tax-preview.view')) !== null) {
            return $denied;
        }

        $year = (int) ($request->input('year') ?? date('Y'));
        $userId = (int) Auth::id();

        $data = $this->service->datasetForYear($userId, $year, true);

        // Payslips are exposed via the list_payslips tool instead
        unset($data['payslips']);

        return Response::json($data);
    }

    /**
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'year' => $schema->integer()->description('Tax year to retrieve (defaults to current year)')->nullable(),
        ];
    }
}
