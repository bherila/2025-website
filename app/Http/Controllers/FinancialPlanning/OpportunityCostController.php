<?php

namespace App\Http\Controllers\FinancialPlanning;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeOpportunityCostRequest;
use App\Http\Requests\FinancialPlanning\StoreOpportunityCostComparisonRequest;
use App\Http\Requests\FinancialPlanning\UpdateOpportunityCostComparisonRequest;
use App\Models\CareerJob;
use App\Models\OpportunityCostComparison;
use App\Services\Planning\OpportunityCost\OpportunityCostCalculator;
use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use App\Support\ShortCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class OpportunityCostController extends Controller
{
    public function __construct(private OpportunityCostCalculator $calculator) {}

    public function show(): View
    {
        return view('financial-planning.opportunity-cost', [
            'initialData' => [
                'inputs' => OpportunityCostInputs::defaults(),
                'projection' => null,
                'authenticated' => auth()->check(),
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        $comparison = OpportunityCostComparison::query()
            ->where('short_code', $code)
            ->firstOrFail();

        return view('financial-planning.opportunity-cost', [
            'initialData' => [
                'inputs' => $this->inputsFromComparison($comparison)->toArray(),
                'projection' => $comparison->computed_json,
                'authenticated' => Auth::check(),
                'comparison' => [
                    'id' => $comparison->id,
                    'shortCode' => $comparison->short_code,
                    'shareUrl' => url("/financial-planning/opportunity-cost/s/{$comparison->short_code}"),
                    'ownerUserId' => $comparison->user_id,
                    'shareIncludesCurrent' => $comparison->share_includes_current,
                ],
                'canEdit' => Auth::id() !== null && (int) Auth::id() === (int) $comparison->user_id,
            ],
        ]);
    }

    public function savedJobs(): JsonResponse
    {
        $jobs = CareerJob::query()
            ->where('user_id', Auth::id())
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (CareerJob $job): array => [
                'id' => $job->id,
                'kind' => $job->kind,
                'name' => $job->name,
                'spec' => $job->spec_json,
            ]);

        return response()->json(['jobs' => $jobs]);
    }

    public function compute(ComputeOpportunityCostRequest $request): JsonResponse
    {
        return response()->json($this->calculator
            ->project(OpportunityCostInputs::fromArray($request->validated('inputs')))
            ->toArray());
    }

    public function store(StoreOpportunityCostComparisonRequest $request): JsonResponse
    {
        $inputs = OpportunityCostInputs::fromArray($request->validated('inputs'));
        $projection = $this->calculator->project($inputs)->toArray();
        $shortCode = ShortCode::generate(
            fn (string $code): bool => OpportunityCostComparison::query()->where('short_code', $code)->exists(),
        );

        $comparison = DB::transaction(function () use ($inputs, $projection, $shortCode, $request): OpportunityCostComparison {
            $userId = Auth::id();
            $references = $this->persistJobs($inputs, $userId);

            return OpportunityCostComparison::query()->create([
                'user_id' => $userId,
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'short_code' => $shortCode,
                'share_includes_current' => $request->boolean('shareIncludesCurrent', true),
                'computed_json' => $projection,
            ]);
        });

        return response()->json($this->comparisonResponse($comparison, $projection), 201);
    }

    public function update(UpdateOpportunityCostComparisonRequest $request, string $code): JsonResponse
    {
        $comparison = OpportunityCostComparison::query()
            ->where('short_code', $code)
            ->firstOrFail();

        abort_unless(Auth::id() !== null && (int) Auth::id() === (int) $comparison->user_id, 403);

        $inputs = OpportunityCostInputs::fromArray($request->validated('inputs'));
        $projection = $this->calculator->project($inputs)->toArray();

        DB::transaction(function () use ($comparison, $inputs, $projection, $request): void {
            $staleJobIds = $this->referencedJobIds($comparison);
            $references = $this->persistJobs($inputs, Auth::id());

            $comparison->update([
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'share_includes_current' => $request->boolean('shareIncludesCurrent', $comparison->share_includes_current),
                'computed_json' => $projection,
            ]);

            CareerJob::query()->whereIn('id', $staleJobIds)->delete();
        });

        return response()->json($this->comparisonResponse($comparison, $projection));
    }

    public function claim(string $code): JsonResponse
    {
        $comparison = OpportunityCostComparison::query()
            ->where('short_code', $code)
            ->firstOrFail();

        $userId = (int) Auth::id();

        abort_if($comparison->user_id !== null && (int) $comparison->user_id !== $userId, 403);

        if ($comparison->user_id === null) {
            DB::transaction(function () use ($comparison, $userId): void {
                $comparison->update(['user_id' => $userId]);
                CareerJob::query()
                    ->whereIn('id', $this->referencedJobIds($comparison))
                    ->whereNull('user_id')
                    ->update(['user_id' => $userId]);
            });
        }

        return response()->json($this->comparisonResponse($comparison, $comparison->computed_json));
    }

    /**
     * Rebuild the calculator inputs from a saved comparison's referenced jobs.
     */
    private function inputsFromComparison(OpportunityCostComparison $comparison): OpportunityCostInputs
    {
        $currentJob = $comparison->current_job_id !== null
            ? CareerJob::query()->find($comparison->current_job_id)
            : null;

        $hypothetical = CareerJob::query()
            ->whereIn('id', $comparison->hypothetical_job_ids)
            ->get()
            ->keyBy('id');

        $computed = $comparison->computed_json ?? [];
        $defaults = OpportunityCostInputs::defaults();

        $hypotheticalSpecs = [];
        foreach ($comparison->hypothetical_job_ids as $id) {
            $job = $hypothetical->get($id);
            if ($job instanceof CareerJob) {
                $hypotheticalSpecs[] = $job->spec_json;
            }
        }

        return OpportunityCostInputs::fromArray([
            'startYear' => $computed['startYear'] ?? $defaults['startYear'],
            'horizonYears' => $computed['horizonYears'] ?? $defaults['horizonYears'],
            'currentJob' => $currentJob?->spec_json,
            'hypotheticalJobs' => $hypotheticalSpecs,
        ]);
    }

    /**
     * Persist the current + hypothetical jobs as reusable CareerJob rows.
     *
     * @return array{currentJobId: int|null, hypotheticalJobIds: list<int>}
     */
    private function persistJobs(OpportunityCostInputs $inputs, ?int $userId): array
    {
        $currentJob = $inputs->currentJob();
        $currentJobId = null;

        if ($currentJob !== null) {
            $currentJobId = CareerJob::query()->create([
                'user_id' => $userId,
                'kind' => 'current',
                'name' => $currentJob->name(),
                'spec_json' => $currentJob->toArray(),
            ])->id;
        }

        $hypotheticalJobIds = [];

        foreach ($inputs->hypotheticalJobs() as $job) {
            $hypotheticalJobIds[] = CareerJob::query()->create([
                'user_id' => $userId,
                'kind' => 'hypothetical',
                'name' => $job->name(),
                'spec_json' => $job->toArray(),
            ])->id;
        }

        return ['currentJobId' => $currentJobId, 'hypotheticalJobIds' => $hypotheticalJobIds];
    }

    /**
     * @return list<int>
     */
    private function referencedJobIds(OpportunityCostComparison $comparison): array
    {
        $ids = $comparison->current_job_id !== null ? [(int) $comparison->current_job_id] : [];

        foreach ($comparison->hypothetical_job_ids as $id) {
            $ids[] = (int) $id;
        }

        return $ids;
    }

    /**
     * @param  array<string, mixed>|null  $projection
     * @return array<string, mixed>
     */
    private function comparisonResponse(OpportunityCostComparison $comparison, ?array $projection): array
    {
        return [
            'id' => $comparison->id,
            'shortCode' => $comparison->short_code,
            'shareUrl' => url("/financial-planning/opportunity-cost/s/{$comparison->short_code}"),
            'projection' => $projection,
        ];
    }
}
