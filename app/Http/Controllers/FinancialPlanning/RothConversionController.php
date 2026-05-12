<?php

namespace App\Http\Controllers\FinancialPlanning;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeRothConversionRequest;
use App\Http\Requests\FinancialPlanning\StoreRothConversionScenarioRequest;
use App\Http\Requests\FinancialPlanning\UpdateRothConversionScenarioRequest;
use App\Models\FinPlanningRothScenario;
use App\Services\Planning\RothConversionCalculator;
use App\Services\Planning\RothConversionInputs;
use App\Support\ShortCode;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class RothConversionController extends Controller
{
    public function __construct(
        private RothConversionCalculator $calculator,
    ) {}

    public function show(): View
    {
        return view('financial-planning.roth-conversion', [
            'initialData' => [
                'scenario' => null,
                'inputs' => RothConversionInputs::defaults(),
                'projection' => null,
                'canEdit' => false,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        $scenario = FinPlanningRothScenario::query()
            ->where('short_code', $code)
            ->firstOrFail();
        $storedInputs = $scenario->getAttribute('inputs_json');

        return view('financial-planning.roth-conversion', [
            'initialData' => [
                'scenario' => [
                    'id' => $scenario->id,
                    'shortCode' => $scenario->short_code,
                    'title' => $scenario->title,
                    'shareUrl' => url("/financial-planning/roth-conversion/s/{$scenario->short_code}"),
                    'ownerUserId' => $scenario->user_id,
                ],
                'inputs' => RothConversionInputs::fromArray(is_array($storedInputs) ? $storedInputs : [])->toArray(),
                'projection' => $scenario->computed_json,
                'canEdit' => Auth::id() !== null && (int) Auth::id() === (int) $scenario->user_id,
                'authenticated' => Auth::check(),
            ],
        ]);
    }

    public function compute(ComputeRothConversionRequest $request): JsonResponse
    {
        $projection = $this->calculator
            ->project(RothConversionInputs::fromArray($request->validated('inputs')))
            ->toArray();

        return response()->json($projection);
    }

    public function store(StoreRothConversionScenarioRequest $request): JsonResponse
    {
        $inputs = RothConversionInputs::fromArray($request->validated('inputs'));
        $projection = $this->calculator->project($inputs)->toArray();
        $shortCode = ShortCode::generate(
            fn (string $code): bool => FinPlanningRothScenario::query()->where('short_code', $code)->exists(),
        );

        $scenario = FinPlanningRothScenario::query()->create([
            'user_id' => Auth::id(),
            'short_code' => $shortCode,
            'title' => $request->validated('title'),
            'inputs_json' => $inputs->toArray(),
            'computed_json' => $projection,
        ]);

        return response()->json([
            'id' => $scenario->id,
            'shortCode' => $scenario->short_code,
            'shareUrl' => url("/financial-planning/roth-conversion/s/{$scenario->short_code}"),
            'projection' => $projection,
        ], 201);
    }

    public function update(UpdateRothConversionScenarioRequest $request, string $code): JsonResponse
    {
        $scenario = FinPlanningRothScenario::query()
            ->where('short_code', $code)
            ->firstOrFail();

        abort_unless(Auth::id() !== null && (int) Auth::id() === (int) $scenario->user_id, 403);

        $inputs = RothConversionInputs::fromArray($request->validated('inputs'));
        $projection = $this->calculator->project($inputs)->toArray();

        $scenario->update([
            'title' => $request->validated('title'),
            'inputs_json' => $inputs->toArray(),
            'computed_json' => $projection,
        ]);

        return response()->json([
            'id' => $scenario->id,
            'shortCode' => $scenario->short_code,
            'shareUrl' => url("/financial-planning/roth-conversion/s/{$scenario->short_code}"),
            'projection' => $projection,
        ]);
    }
}
