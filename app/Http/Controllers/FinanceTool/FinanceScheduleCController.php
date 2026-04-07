<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Services\Finance\ScheduleCSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceScheduleCController extends Controller
{
    public function __construct(
        private ScheduleCSummaryService $scheduleCSummaryService,
    ) {}

    /**
     * Returns Schedule C totals grouped by year and tax characteristic.
     */
    public function getSummary(Request $request): JsonResponse
    {
        $yearFilter = $request->filled('year') ? (int) $request->query('year') : null;

        return response()->json(
            $this->scheduleCSummaryService->getSummary((int) Auth::id(), $yearFilter),
        );
    }
}
