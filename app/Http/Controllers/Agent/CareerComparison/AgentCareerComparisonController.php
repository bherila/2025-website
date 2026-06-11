<?php

namespace App\Http\Controllers\Agent\CareerComparison;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Http\Requests\FinancialPlanning\SaveCareerCompComparisonRequest;
use App\Http\Requests\FinancialPlanning\ShareCareerCompComparisonRequest;
use App\Models\CareerComparison;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\ComparisonSharePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Agent API surface for Career Comparison (/api/agent/v1/career-comparison).
 *
 * Anonymous access is strictly read-only: public share read (redacted,
 * expired -> 404) and stateless compute. The web app's anonymous share-edit
 * (PUT /financial-planning/career-comparison/s/{code}) is deliberately NOT
 * exposed here. Private CRUD requires a bearer token plus the
 * financial-planning.career-comparison.private feature (import-rsu requires
 * finance.rsu.view), enforced by route middleware. All behavior delegates to
 * CareerComparisonWorkflowService and the same Form Requests the web
 * controller uses.
 */
class AgentCareerComparisonController extends Controller
{
    public function __construct(
        private CareerCompCalculator $calculator,
        private ComparisonSharePresenter $sharePresenter,
        private CareerComparisonWorkflowService $workflows,
    ) {}

    /**
     * Public, read-only share view. Redacts the confidential current job for
     * non-creators; unknown or expired codes are indistinguishable (404).
     */
    public function publicShare(string $code): JsonResponse
    {
        $share = $this->workflows->findActiveShare($code);
        abort_unless($share instanceof CareerComparison, 404);

        return response()->json($this->sharePresenter->shareResponse($share, $this->isCreator($share)));
    }

    /**
     * Public, stateless projection compute — nothing is persisted.
     */
    public function compute(ComputeCareerCompRequest $request): JsonResponse
    {
        return response()->json($this->calculator
            ->project(CareerCompInputs::fromArray($request->validated('inputs')))
            ->toArray());
    }

    public function latest(): JsonResponse
    {
        $latest = $this->workflows->latestForUser((int) Auth::id());

        if (! $latest instanceof CareerComparison) {
            return response()->json(['workflow' => null]);
        }

        return response()->json(['workflow' => $this->workflows->response($latest)]);
    }

    /**
     * Upsert the token owner's private latest (NULL short_code) comparison.
     */
    public function saveLatest(SaveCareerCompComparisonRequest $request): JsonResponse
    {
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $comparison = $this->workflows->saveLatest((int) Auth::id(), $inputs);

        return response()->json($this->workflows->response($comparison));
    }

    /**
     * Fork the submitted inputs into a new, link-shareable copy owned by the caller.
     */
    public function createShare(ShareCareerCompComparisonRequest $request): JsonResponse
    {
        $inputs = CareerCompInputs::fromArray($request->validated('inputs'));
        $share = $this->workflows->createShare(
            (int) Auth::id(),
            $inputs,
            $request->boolean('shareIncludesCurrent', true),
            $request->date('expiresAt'),
        );

        return response()->json($this->sharePresenter->shareResponse($share, true), 201);
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

        return response()->json($this->sharePresenter->shareResponse($share, true));
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

    /**
     * Build a currentJob spec from the caller's equity awards — read-only,
     * nothing is persisted until the agent saves the returned inputs.
     */
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
}
