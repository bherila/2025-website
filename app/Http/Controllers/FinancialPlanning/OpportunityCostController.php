<?php

namespace App\Http\Controllers\FinancialPlanning;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeOpportunityCostRequest;
use App\Services\Planning\OpportunityCost\OpportunityCostCalculator;
use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use Illuminate\Http\JsonResponse;
use Illuminate\View\View;

class OpportunityCostController extends Controller
{
    public function __construct(private OpportunityCostCalculator $calculator) {}

    public function show(): View
    {
        return view('financial-planning.opportunity-cost', [
            'initialData' => [
                'inputs' => OpportunityCostInputs::defaults(),
                'share' => null,
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        return view('financial-planning.opportunity-cost', [
            'initialData' => [
                'inputs' => OpportunityCostInputs::defaults(),
                'share' => [
                    'code' => $code,
                    'isStub' => true,
                ],
            ],
        ]);
    }

    public function compute(ComputeOpportunityCostRequest $request): JsonResponse
    {
        return response()->json($this->calculator
            ->project(OpportunityCostInputs::fromArray($request->validated('inputs')))
            ->toArray());
    }
}
