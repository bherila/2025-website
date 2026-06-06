<?php

namespace App\Http\Controllers\FinancialPlanning;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Http\Requests\FinancialPlanning\ShareCareerCompComparisonRequest;
use App\Http\Requests\FinancialPlanning\StoreCareerCompComparisonRequest;
use App\Http\Requests\FinancialPlanning\UpdateCareerCompComparisonRequest;
use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\ComparisonShareRedactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class CareerCompController extends Controller
{
    public function __construct(
        private CareerCompCalculator $calculator,
        private ComparisonShareRedactor $shareRedactor,
        private CareerComparisonWorkflowService $workflows,
    ) {}

    public function show(): View
    {
        $lastActive = Auth::id() !== null ? $this->workflows->lastActiveWorkflow((int) Auth::id()) : null;

        if ($lastActive instanceof CareerComparison) {
            return view('financial-planning.career-comparison', [
                'initialData' => array_merge($this->workflows->response($lastActive), [
                    'authenticated' => true,
                    'comparison' => $this->comparisonMeta($lastActive),
                    'canEdit' => true,
                ]),
            ]);
        }

        return view('financial-planning.career-comparison', [
            'initialData' => [
                'inputs' => CareerCompInputs::defaults(),
                'projection' => null,
                'authenticated' => auth()->check(),
            ],
        ]);
    }

    public function showByCode(string $code): View
    {
        $comparison = CareerComparison::query()
            ->where('short_code', $code)
            ->firstOrFail();

        $ownsComparison = Auth::id() !== null
            && (int) Auth::id() === (int) $comparison->user_id;
        $canEdit = $ownsComparison
            && ! $comparison->is_snapshot;
        $inputs = $this->workflows->inputsFromComparison($comparison)->toArray();
        $projection = $comparison->computed_json;

        // Confidential ("exclusive") share: redact the current job by identity for anyone who
        // cannot edit the comparison, so no current-job dollar value reaches the page payload.
        if (! $comparison->share_includes_current && ! $ownsComparison) {
            $currentJobId = is_array($projection) && is_string($projection['currentJobId'] ?? null)
                ? $projection['currentJobId']
                : (is_array($inputs['currentJob'] ?? null) ? ($inputs['currentJob']['id'] ?? null) : null);
            $redacted = $this->shareRedactor->redact($inputs, $projection, is_string($currentJobId) ? $currentJobId : null);
            $inputs = $redacted['inputs'];
            $projection = $redacted['projection'];
        }

        return view('financial-planning.career-comparison', [
            'initialData' => [
                'inputs' => $inputs,
                'projection' => $projection,
                'authenticated' => Auth::check(),
                'comparison' => $this->comparisonMeta($comparison),
                'canEdit' => $canEdit,
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

    public function compute(ComputeCareerCompRequest $request): JsonResponse
    {
        return response()->json($this->calculator
            ->project(CareerCompInputs::fromArray($request->validated('inputs')))
            ->toArray());
    }

    public function store(StoreCareerCompComparisonRequest $request): JsonResponse
    {
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $shareIncludesCurrent = $request->has('shareIncludesCurrent') ? $request->boolean('shareIncludesCurrent') : true;
        $comparison = $this->workflows->createWorkflow((int) Auth::id(), $inputs, $request->validated('title'), $shareIncludesCurrent);

        return response()->json($this->workflows->response($comparison), 201);
    }

    public function update(UpdateCareerCompComparisonRequest $request, int|string $workflow): JsonResponse
    {
        $comparison = is_string($workflow) && ! ctype_digit($workflow)
            ? CareerComparison::query()->where('short_code', $workflow)->firstOrFail()
            : $this->ownedWorkflow($workflow);
        abort_unless(Auth::id() !== null && (int) Auth::id() === (int) $comparison->user_id, 403);

        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $comparison = $this->workflows->updateWorkflow($comparison, $inputs, $request->validated('title'), $request->has('shareIncludesCurrent') ? $request->boolean('shareIncludesCurrent') : null);

        return response()->json($this->workflows->response($comparison));
    }

    public function claim(string $code): JsonResponse
    {
        $comparison = CareerComparison::query()
            ->where('short_code', $code)
            ->firstOrFail();

        $userId = (int) Auth::id();

        abort_if($comparison->user_id !== null && (int) $comparison->user_id !== $userId, 403);

        if ($comparison->user_id === null) {
            $comparison = $this->workflows->claim($comparison, $userId, $this->referencedJobIdsForClaim($comparison));
        }

        return response()->json($this->workflows->response($comparison));
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'workflows' => $this->workflows->listWorkflows((int) Auth::id())
                ->map(fn (CareerComparison $comparison): array => $this->workflows->summary($comparison))
                ->values(),
        ]);
    }

    public function showWorkflow(int $workflow): JsonResponse
    {
        return response()->json($this->workflows->response($this->ownedWorkflow($workflow)));
    }

    public function lastActive(): JsonResponse
    {
        $workflow = $this->workflows->lastActiveWorkflow((int) Auth::id());

        if (! $workflow instanceof CareerComparison) {
            return response()->json(['workflow' => null]);
        }

        return response()->json(['workflow' => $this->workflows->response($workflow)]);
    }

    public function activate(int $workflow): JsonResponse
    {
        return response()->json($this->workflows->response($this->workflows->markLastActive($this->ownedWorkflow($workflow))));
    }

    public function destroy(int $workflow): JsonResponse
    {
        $this->workflows->deleteWorkflow($this->ownedWorkflow($workflow));

        return response()->json(['deleted' => true]);
    }

    public function share(ShareCareerCompComparisonRequest $request): JsonResponse
    {
        $snapshot = $this->workflows->createSnapshot(
            Auth::id() !== null ? (int) Auth::id() : null,
            CareerCompInputs::fromArray($request->validated('inputs')),
            $request->boolean('shareIncludesCurrent', true),
        );

        return response()->json($this->workflows->response($snapshot), 201);
    }

    public function importRsu(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'currentJob' => ['nullable', 'array'],
        ]);

        return response()->json($this->workflows->importRsuCurrentJob((int) Auth::id(), $validated['currentJob'] ?? null));
    }

    private function ownedWorkflow(int|string $workflow): CareerComparison
    {
        $query = CareerComparison::query()
            ->where('user_id', Auth::id());

        if (is_int($workflow) || ctype_digit((string) $workflow)) {
            $query->where('id', (int) $workflow)
                ->where('is_snapshot', false);
        } else {
            $query->where('short_code', (string) $workflow);
        }

        return $query->firstOrFail();
    }

    /**
     * @return list<int>
     */
    private function referencedJobIdsForClaim(CareerComparison $comparison): array
    {
        $ids = $comparison->current_job_id !== null ? [(int) $comparison->current_job_id] : [];

        foreach ($comparison->hypothetical_job_ids as $id) {
            $ids[] = (int) $id;
        }

        return $ids;
    }

    /**
     * @return array<string, mixed>
     */
    private function comparisonMeta(CareerComparison $comparison): array
    {
        return [
            'id' => $comparison->id,
            'shortCode' => $comparison->short_code,
            'shareUrl' => url("/financial-planning/career-comparison/s/{$comparison->short_code}"),
            'ownerUserId' => $comparison->user_id,
            'shareIncludesCurrent' => $comparison->share_includes_current,
            'isSnapshot' => $comparison->is_snapshot,
            'title' => $comparison->title,
        ];
    }
}
