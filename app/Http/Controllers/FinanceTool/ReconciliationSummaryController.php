<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Services\Finance\CapitalGains\ReconciliationSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ReconciliationSummaryController extends Controller
{
    public function __construct(
        private readonly ReconciliationSummaryService $reconciliationSummaryService,
    ) {}

    public function show(int $year): JsonResponse
    {
        if ($year < 1900 || $year > 2100) {
            return response()->json([
                'message' => 'The selected year is invalid.',
                'errors' => [
                    'year' => ['The year must be between 1900 and 2100.'],
                ],
            ], 422);
        }

        return response()->json($this->reconciliationSummaryService->summaryForYear((int) Auth::id(), $year));
    }
}
