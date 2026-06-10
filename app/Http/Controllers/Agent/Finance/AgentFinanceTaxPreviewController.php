<?php

namespace App\Http\Controllers\Agent\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\TaxPreviewDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * GET /api/agent/v1/finance/tax-preview/{year} — full tax preview dataset for
 * the year. ?include_tax_facts=1 adds the backend tax fact source lines.
 * Requires finance.tax-preview.view.
 */
class AgentFinanceTaxPreviewController extends Controller
{
    public function __construct(private readonly TaxPreviewDataService $service) {}

    public function __invoke(Request $request, int $year): JsonResponse
    {
        $data = $this->service->datasetForYear(
            (int) Auth::id(),
            $year,
            $request->boolean('include_tax_facts'),
        );

        return response()->json($data);
    }
}
