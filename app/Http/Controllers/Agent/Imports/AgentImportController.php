<?php

namespace App\Http\Controllers\Agent\Imports;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiImportService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Accounting\AccountingPeriodLockGuard;
use App\Support\Accounting\PeriodLockedException;
use App\Support\Agent\AgentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Agent API surface over the GenAI import pipeline (/api/agent/v1/imports).
 *
 * Thin wrapper over GenAiImportService — the same workflow the web UI uses —
 * with three agent-specific tightenings:
 * - only finance job types are reachable (PHR / class-action types → 403);
 * - the job-type permission map is enforced through AgentContext::can(), so
 *   module-scoped token restrictions apply on top of user permissions;
 * - import-confirm paths (job create/retry) pass the accounting-period lock
 *   guard, so imports that would feed a locked partnership-basis year are
 *   rejected with a structured 409 instead of silently mutating basis data.
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

    public function __construct(
        private readonly GenAiImportService $importService,
        private readonly AccountingPeriodLockGuard $lockGuard,
    ) {}

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

    /**
     * Lock-guard hook for import-confirm paths. An import targeting an
     * account that holds a partnership interest can feed basis data, so when
     * the job carries both an account and a tax year (e.g. K-1
     * document_extract jobs) the partnership-basis year lock must be
     * respected. Jobs without an account or a determinable year cannot be
     * attributed to a lockable period and pass through.
     *
     * @param  array<string, mixed>|null  $context
     *
     * @throws PeriodLockedException
     */
    private function assertBasisPeriodUnlocked(?int $acctId, ?array $context): void
    {
        if ($acctId === null) {
            return;
        }

        $taxYear = $context['tax_year'] ?? null;
        if (! is_numeric($taxYear)) {
            return;
        }

        $this->lockGuard->assertEditable(
            (int) $this->user()->id,
            AccountingPeriodLockGuard::DOMAIN_PARTNERSHIP_BASIS,
            (int) $taxYear,
            $acctId,
            $context,
        );
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
            fn (string $jobType, ?int $acctId, ?array $context) => $this->assertBasisPeriodUnlocked($acctId, $context),
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
            fn (GenAiImportJob $job) => $this->assertBasisPeriodUnlocked(
                $job->acct_id !== null ? (int) $job->acct_id : null,
                $job->getContextArray(),
            ),
        );
    }

    /** DELETE /api/agent/v1/imports/jobs/{id} */
    public function destroy(int $id): JsonResponse
    {
        return $this->importService->deleteJob(
            $this->user(),
            $id,
            self::AGENT_JOB_TYPES,
            $this->permissionChecker(),
        );
    }
}
