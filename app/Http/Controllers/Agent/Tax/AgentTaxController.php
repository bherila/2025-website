<?php

namespace App\Http\Controllers\Agent\Tax;

use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\Tax\CompareReturnLinesRequest;
use App\Services\Finance\TaxReturnLineComparisonService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * POST /api/agent/v1/tax/preview/{year}/compare-return-lines — compare
 * agent-extracted CPA return lines against the tax preview totals for the
 * year. Requires finance.tax-preview.view. Pure computation: the CPA return
 * is never uploaded or stored and no rows are created or mutated.
 */
class AgentTaxController extends Controller
{
    public function __construct(private readonly TaxReturnLineComparisonService $service) {}

    public function compareReturnLines(CompareReturnLinesRequest $request, int $year): JsonResponse
    {
        $validated = $request->validated();

        $result = $this->service->compareForUser(
            (int) Auth::id(),
            $year,
            $validated['lines'],
            (int) ($validated['tolerance_cents'] ?? 0),
            $validated['return_type'] ?? null,
        );

        return response()->json($result);
    }
}
