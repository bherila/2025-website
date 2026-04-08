<?php

namespace App\Mcp\Tools;

use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;

#[Description('Get the full tax preview dataset for a given year, including W-2s, 1099s, Schedule C, capital gains, Form 1116 foreign tax data, and action items. For payslip data use the list_payslips tool.')]
class GetTaxPreview extends Tool
{
    public function __construct(
        private TaxPreviewDataService $service,
    ) {}

    public function handle(Request $request): Response
    {
        $year = (int) ($request->input('year') ?? date('Y'));
        $userId = (int) Auth::id();

        $data = $this->service->datasetForYear($userId, $year);

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
