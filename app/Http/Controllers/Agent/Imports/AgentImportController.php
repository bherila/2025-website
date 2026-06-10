<?php

namespace App\Http\Controllers\Agent\Imports;

use App\GenAiProcessor\Services\GenAiImportService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Agent\AgentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Agent API surface over the GenAI import pipeline (/api/agent/v1/imports).
 *
 * Thin wrapper over GenAiImportService — the same workflow the web UI uses —
 * with two agent-specific tightenings:
 * - only finance job types are reachable (PHR / class-action types → 403);
 * - the job-type permission map is enforced through AgentContext::can(), so
 *   module-scoped token restrictions apply on top of user permissions.
 */
class AgentImportController extends Controller
{
    /** Job types exposed via the agent API. @var list<string> */
    public const AGENT_JOB_TYPES = [
        'finance_transactions',
        'finance_payslip',
        'equity_award',
        'document_extract',
    ];

    public function __construct(private readonly GenAiImportService $importService) {}

    /** @return callable(string): bool */
    private function permissionChecker(): callable
    {
        $context = app(AgentContext::class);

        return fn (string $permission): bool => $context->can($permission);
    }

    private function user(): User
    {
        return Auth::user();
    }

    /** POST /api/agent/v1/imports/request-upload */
    public function requestUpload(Request $request): JsonResponse
    {
        return $this->importService->requestUpload(
            $this->user(),
            $request,
            $this->permissionChecker(),
            self::AGENT_JOB_TYPES,
        );
    }

    /** POST /api/agent/v1/imports/jobs */
    public function createJob(Request $request): JsonResponse
    {
        return $this->importService->createJob(
            $this->user(),
            $request,
            $this->permissionChecker(),
            self::AGENT_JOB_TYPES,
        );
    }

    /** GET /api/agent/v1/imports/jobs */
    public function index(Request $request): JsonResponse
    {
        return $this->importService->listJobs(
            $this->user(),
            $request,
            $this->permissionChecker(),
            self::AGENT_JOB_TYPES,
        );
    }

    /** GET /api/agent/v1/imports/jobs/{id} */
    public function show(int $id): JsonResponse
    {
        return $this->importService->showJob(
            $this->user(),
            $id,
            $this->permissionChecker(),
            self::AGENT_JOB_TYPES,
        );
    }

    /** POST /api/agent/v1/imports/jobs/{id}/retry */
    public function retry(int $id): JsonResponse
    {
        return $this->importService->retryJob(
            $this->user(),
            $id,
            $this->permissionChecker(),
            self::AGENT_JOB_TYPES,
        );
    }

    /** DELETE /api/agent/v1/imports/jobs/{id} */
    public function destroy(int $id): JsonResponse
    {
        return $this->importService->deleteJob(
            $this->user(),
            $id,
            self::AGENT_JOB_TYPES,
        );
    }
}
