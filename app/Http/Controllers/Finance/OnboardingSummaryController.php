<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Finance\Onboarding\FinanceOnboardingSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OnboardingSummaryController extends Controller
{
    public function __construct(
        private readonly FinanceOnboardingSummaryService $onboardingSummaryService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
        ]);

        /** @var User $user */
        $user = $request->user();

        $availableYears = $this->onboardingSummaryService->availableYears($user);
        $year = $this->onboardingSummaryService->resolveYear(
            isset($validated['year']) ? (int) $validated['year'] : null,
            $availableYears,
        );

        return response()->json($this->onboardingSummaryService->summaryForYear($user, $year));
    }
}
