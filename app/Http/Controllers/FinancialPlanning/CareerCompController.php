<?php

namespace App\Http\Controllers\FinancialPlanning;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Http\Requests\FinancialPlanning\SaveCareerCompComparisonRequest;
use App\Http\Requests\FinancialPlanning\ShareCareerCompComparisonRequest;
use App\Models\CareerComparison;
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
        $latest = Auth::id() !== null ? $this->workflows->latestForUser((int) Auth::id()) : null;

        if ($latest instanceof CareerComparison) {
            return view('financial-planning.career-comparison', [
                'initialData' => array_merge($this->workflows->response($latest), [
                    'authenticated' => true,
                    'comparison' => $this->comparisonMeta($latest, true),
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
        $share = $this->workflows->findActiveShare($code);
        abort_unless($share instanceof CareerComparison, 404);

        $isCreator = $this->isCreator($share);
        $inputs = $this->workflows->inputsFromComparison($share)->toArray();
        $projection = $share->computed_json;

        // Confidential share: hide the current job from anyone who is not the creator, so no
        // current-job dollar value reaches the page payload (directly or via the deltas column).
        if (! $share->share_includes_current && ! $isCreator) {
            [$inputs, $projection] = $this->redactCurrent($inputs, $projection);
        }

        return view('financial-planning.career-comparison', [
            'initialData' => [
                'inputs' => $inputs,
                'projection' => $projection,
                'authenticated' => Auth::check(),
                'comparison' => $this->comparisonMeta($share, $isCreator),
                // Shared forks are collaboratively editable by anyone holding the link.
                'canEdit' => true,
            ],
        ]);
    }

    public function compute(ComputeCareerCompRequest $request): JsonResponse
    {
        return response()->json($this->calculator
            ->project(CareerCompInputs::fromArray($request->validated('inputs')))
            ->toArray());
    }

    /**
     * Autosave: upsert the authenticated user's private latest (NULL short_code) comparison.
     */
    public function saveLatest(SaveCareerCompComparisonRequest $request): JsonResponse
    {
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $comparison = $this->workflows->saveLatest((int) Auth::id(), $inputs);

        return response()->json($this->workflows->response($comparison));
    }

    /**
     * Return the authenticated user's current latest comparison, if any.
     */
    public function latest(): JsonResponse
    {
        $latest = $this->workflows->latestForUser((int) Auth::id());

        if (! $latest instanceof CareerComparison) {
            return response()->json(['workflow' => null]);
        }

        return response()->json(['workflow' => $this->workflows->response($latest)]);
    }

    /**
     * Fork the current inputs into a new, link-shareable, editable copy owned by the creator.
     */
    public function share(ShareCareerCompComparisonRequest $request): JsonResponse
    {
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $share = $this->workflows->createShare(
            (int) Auth::id(),
            $inputs,
            $request->boolean('shareIncludesCurrent', true),
            $request->date('expiresAt'),
        );

        return response()->json($this->shareResponse($share, true), 201);
    }

    /**
     * Autosave edits made to a shared fork by anyone holding the link.
     */
    public function saveShare(ShareCareerCompComparisonRequest $request, string $code): JsonResponse
    {
        $share = $this->workflows->findActiveShare($code);
        abort_unless($share instanceof CareerComparison, 404);

        $isCreator = $this->isCreator($share);
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $share = $this->workflows->saveShare($share, $inputs, ! $share->share_includes_current && ! $isCreator);

        return response()->json($this->shareResponse($share, $isCreator));
    }

    /**
     * Creator-only: set or clear a shared fork's expiration.
     */
    public function updateShare(Request $request, string $code): JsonResponse
    {
        $share = $this->workflows->findActiveShare($code);
        abort_unless($share instanceof CareerComparison, 404);
        abort_unless($this->isCreator($share), 403);

        $request->validate(['expiresAt' => ['nullable', 'date']]);
        $share = $this->workflows->setShareExpiration($share, $request->date('expiresAt'));

        return response()->json($this->shareResponse($share, true));
    }

    /**
     * Creator-only: delete a shared fork.
     */
    public function deleteShare(string $code): JsonResponse
    {
        $share = $this->workflows->findActiveShare($code);
        abort_unless($share instanceof CareerComparison, 404);
        abort_unless($this->isCreator($share), 403);

        $this->workflows->deleteShare($share);

        return response()->json(['deleted' => true]);
    }

    public function importRsu(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'currentJob' => ['nullable', 'array'],
        ]);

        return response()->json($this->workflows->importRsuCurrentJob((int) Auth::id(), $validated['currentJob'] ?? null));
    }

    private function isCreator(CareerComparison $comparison): bool
    {
        return Auth::id() !== null && $comparison->user_id !== null && (int) Auth::id() === (int) $comparison->user_id;
    }

    /**
     * Build a share's API response, redacting the confidential current job for non-creators.
     *
     * @return array<string, mixed>
     */
    private function shareResponse(CareerComparison $share, bool $isCreator): array
    {
        $response = $this->workflows->response($share);
        $response['isCreator'] = $isCreator;

        if (! $share->share_includes_current && ! $isCreator) {
            $inputs = is_array($response['inputs'] ?? null) ? $response['inputs'] : [];
            $projection = is_array($response['projection'] ?? null) ? $response['projection'] : null;
            [$response['inputs'], $response['projection']] = $this->redactCurrent($inputs, $projection);
            $response['title'] = 'Career comparison';
        }

        return $response;
    }

    /**
     * @param  array<string, mixed>  $inputs
     * @param  array<string, mixed>|null  $projection
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    private function redactCurrent(array $inputs, ?array $projection): array
    {
        $redacted = $this->shareRedactor->redact($inputs, $projection, $this->currentJobIdsForRedaction($inputs, $projection));
        $redactedProjection = $projection !== null
            ? $this->calculator->project(CareerCompInputs::fromArray($redacted['inputs']))->toArray()
            : null;

        return [$redacted['inputs'], $redactedProjection];
    }

    /**
     * @param  array<string, mixed>  $inputs
     * @param  array<string, mixed>|null  $projection
     * @return list<string>
     */
    private function currentJobIdsForRedaction(array $inputs, ?array $projection): array
    {
        if (is_array($projection) && is_array($projection['currentJobIds'] ?? null)) {
            return array_values(array_filter(array_map(
                static fn (mixed $id): string => trim((string) $id),
                $projection['currentJobIds'],
            ), static fn (string $id): bool => $id !== ''));
        }

        if (is_array($inputs['currentJobs'] ?? null)) {
            return array_values(array_filter(array_map(
                static fn (mixed $job): string => is_array($job) ? trim((string) ($job['id'] ?? '')) : '',
                $inputs['currentJobs'],
            ), static fn (string $id): bool => $id !== ''));
        }

        if (is_array($inputs['currentJob'] ?? null) && is_string($inputs['currentJob']['id'] ?? null)) {
            return [$inputs['currentJob']['id']];
        }

        if (is_array($projection) && is_string($projection['currentJobId'] ?? null)) {
            return [$projection['currentJobId']];
        }

        return [];
    }

    /**
     * @return array<string, mixed>
     */
    private function comparisonMeta(CareerComparison $comparison, bool $isCreator): array
    {
        return [
            'id' => $comparison->id,
            'shortCode' => $comparison->short_code,
            'shareUrl' => $comparison->short_code !== null ? url("/financial-planning/career-comparison/s/{$comparison->short_code}") : null,
            'ownerUserId' => $comparison->user_id,
            'shareIncludesCurrent' => $comparison->share_includes_current,
            'expiresAt' => $comparison->expires_at?->toIso8601String(),
            'isCreator' => $isCreator,
            'title' => ! $comparison->share_includes_current && ! $isCreator ? 'Career comparison' : $comparison->title,
        ];
    }
}
