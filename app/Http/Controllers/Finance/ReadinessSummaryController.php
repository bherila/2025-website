<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\ReadinessSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class ReadinessSummaryController extends Controller
{
    public function __construct(
        private readonly ReadinessSummaryService $readinessSummaryService,
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

        $userId = (int) Auth::id();
        $cacheKey = "tax_readiness_summary:{$userId}:{$year}";

        $summary = Cache::remember(
            $cacheKey,
            now()->addSeconds(60),
            fn () => $this->readinessSummaryService->summaryForYear($userId, $year)
        );

        return response()->json($summary);
    }
}
