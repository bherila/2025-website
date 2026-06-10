<?php

namespace App\GenAiProcessor\Services;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\FileStorageService;
use App\Services\PHR\Access\PhrPatientAccessService;
use App\Services\PHR\Import\PhrStructuredDataImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Shared GenAI import workflow used by BOTH the web controller
 * (GenAiImportController, session auth) and the agent API controller
 * (AgentImportController, bearer-token auth).
 *
 * Behavior-preserving extraction of the original controller actions. Each
 * method receives a `$can` permission callable so the web surface can check
 * FeatureAccess directly while the agent surface routes the same checks
 * through AgentContext::can() (which also applies token scope).
 *
 * `$restrictToJobTypes` lets the agent surface confine the workflow to
 * finance job types; values outside the list are rejected with 403 (or
 * filtered out of unfiltered listings). The web surface passes null.
 */
class GenAiImportService
{
    public const FILTERED_JOB_LIMIT = 50;

    public const DEFAULT_JOB_LIMIT = 20;

    public function __construct(
        private readonly FileStorageService $fileService,
        private readonly GenAiJobDispatcherService $dispatcher,
        private readonly PhrPatientAccessService $phrAccessService,
    ) {}

    /**
     * Feature permission required to view/act on a given import job type.
     * Job types not listed here (e.g. PHR types) are unrestricted.
     */
    public function permissionForJobType(string $jobType): ?string
    {
        return match ($jobType) {
            'finance_transactions' => 'finance.transactions.import',
            'finance_payslip' => 'finance.payslips.manage',
            'equity_award' => 'finance.rsu.manage',
            'utility_bill' => 'utility-bills.manage',
            'document_extract' => 'finance.tax-documents.manage',
            default => null,
        };
    }

    /** @param callable(string): bool $can */
    public function authorizeJobType(callable $can, string $jobType): ?JsonResponse
    {
        $permission = $this->permissionForJobType($jobType);

        if ($permission === null) {
            return null;
        }

        if (! $can($permission)) {
            return response()->json([
                'message' => 'Forbidden',
                'required_permission' => $permission,
            ], 403);
        }

        return null;
    }

    /** @param list<string>|null $restrictToJobTypes */
    private function rejectRestrictedJobType(?array $restrictToJobTypes, string $jobType): ?JsonResponse
    {
        if ($restrictToJobTypes !== null && ! in_array($jobType, $restrictToJobTypes, true)) {
            return response()->json([
                'message' => 'This import job type is not available via the agent API.',
            ], 403);
        }

        return null;
    }

    /**
     * Generate a pre-signed S3 upload URL.
     *
     * @param  callable(string): bool  $can
     * @param  list<string>|null  $restrictToJobTypes
     */
    public function requestUpload(User $user, Request $request, callable $can, ?array $restrictToJobTypes = null): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'filename' => 'required|string|max:255',
            'content_type' => 'required|string|max:128',
            'file_size' => 'required|integer|min:1|max:52428800', // 50MB max
            'job_type' => 'required|string|in:'.implode(',', GenAiImportJob::VALID_JOB_TYPES),
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $jobType = (string) $request->input('job_type');
        if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, $jobType)) !== null) {
            return $rejected;
        }
        if (($denied = $this->authorizeJobType($can, $jobType)) !== null) {
            return $denied;
        }

        $filename = $request->input('filename');
        $contentType = $request->input('content_type');

        // Generate a clean S3 key: genai-import/{user_id}/{uuid}/{sanitized_filename}
        // This produces a nicer download filename and avoids random-looking prefixes.
        $sanitizedFilename = preg_replace('/[^\w.\-]/', '_', $filename);
        $uuid = (string) Str::uuid();
        $s3Key = "genai-import/{$user->id}/{$uuid}/{$sanitizedFilename}";

        try {
            $signedUrl = $this->fileService->getSignedUploadUrl($s3Key, $contentType, 15);
        } catch (\RuntimeException $e) {
            Log::error('Failed to generate signed upload URL', ['error' => $e->getMessage()]);

            return response()->json(['error' => 'Storage is not configured.'], 503);
        }

        return response()->json([
            'signed_url' => $signedUrl,
            's3_key' => $s3Key,
            'expires_in' => 900, // 15 minutes in seconds
        ]);
    }

    /**
     * Create a new import job after the file has been uploaded to S3.
     *
     * @param  callable(string): bool  $can
     * @param  list<string>|null  $restrictToJobTypes
     * @param  (callable(string, ?int, ?array<string, mixed>): void)|null  $beforeCreate  Hook invoked
     *                                                                                    with (jobType, acctId, context) after all validation/ownership checks pass and before
     *                                                                                    the job row is created; may throw (e.g. PeriodLockedException) to abort.
     */
    public function createJob(User $user, Request $request, callable $can, ?array $restrictToJobTypes = null, ?callable $beforeCreate = null): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            's3_key' => 'required|string|max:512',
            'original_filename' => 'required|string|max:255',
            'file_size_bytes' => 'required|integer|min:1',
            'mime_type' => 'nullable|string|max:128',
            'job_type' => 'required|string|in:'.implode(',', GenAiImportJob::VALID_JOB_TYPES),
            'context' => 'nullable|array',
            'acct_id' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $jobType = $request->input('job_type');
        if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, $jobType)) !== null) {
            return $rejected;
        }
        if (($denied = $this->authorizeJobType($can, $jobType)) !== null) {
            return $denied;
        }

        $context = $request->input('context');

        // Validate context schema against job_type to prevent injection
        try {
            $this->dispatcher->validateContext($jobType, $context);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        if (PhrStructuredDataImporter::isPhrJobType($jobType)) {
            $patientId = (int) ($context['patient_id'] ?? 0);
            if ($patientId <= 0) {
                return response()->json(['error' => 'context.patient_id is required for PHR imports.'], 422);
            }

            try {
                $this->phrAccessService->writablePatient($patientId, (int) $user->id);
            } catch (\Throwable) {
                return response()->json(['error' => 'Patient not found or write access denied.'], 403);
            }
        }

        // Validate acct_id ownership if provided
        $acctId = $request->input('acct_id');
        if ($acctId) {
            $ownsAccount = FinAccounts::where('acct_id', $acctId)
                ->where('acct_owner', $user->id)
                ->exists();

            if (! $ownsAccount) {
                return response()->json(['error' => 'Account not found or access denied.'], 403);
            }
        }

        $s3Key = $request->input('s3_key');

        // Validate s3_key belongs to the authenticated user's prefix to prevent cross-user access
        $expectedPrefix = "genai-import/{$user->id}/";
        if (! str_starts_with($s3Key, $expectedPrefix)) {
            return response()->json(['error' => 'Invalid file reference.'], 403);
        }

        if ($beforeCreate !== null) {
            $beforeCreate((string) $jobType, $acctId !== null ? (int) $acctId : null, $context);
        }

        // Use S3 ETag as the file hash — avoids downloading the full file just to hash it.
        // For single-part PUT uploads (which is what pre-signed URLs use), ETag is the MD5 of the content.
        try {
            $fileHash = Storage::disk('s3')->checksum($s3Key);
        } catch (\Throwable $e) {
            Log::error('Failed to get file checksum from S3', ['s3_key' => $s3Key, 'error' => $e->getMessage()]);

            return response()->json(['error' => 'Failed to read uploaded file.'], 500);
        }

        // De-duplicate: check for existing job with same hash, user, and type that's already parsed/imported
        $existing = GenAiImportJob::where('file_hash', $fileHash)
            ->where('user_id', $user->id)
            ->where('job_type', $jobType)
            ->whereIn('status', ['parsed', 'imported'])
            ->first();

        if ($existing) {
            return response()->json([
                'job_id' => $existing->id,
                'status' => $existing->status,
                'deduplicated' => true,
            ]);
        }

        $job = GenAiImportJob::create([
            'user_id' => $user->id,
            'acct_id' => $acctId,
            'job_type' => $jobType,
            'file_hash' => $fileHash,
            'original_filename' => $request->input('original_filename'),
            's3_path' => $s3Key,
            'mime_type' => $request->input('mime_type'),
            'file_size_bytes' => $request->input('file_size_bytes'),
            'context_json' => $context ? json_encode($context) : null,
            'status' => 'pending',
        ]);

        // Dispatch to queue; quota is claimed inside the worker to avoid double-counting
        ParseImportJob::dispatch($job->id);

        return response()->json([
            'job_id' => $job->id,
            'status' => $job->status,
        ], 201);
    }

    /**
     * List the user's import jobs.
     *
     * @param  callable(string): bool  $can
     * @param  list<string>|null  $restrictToJobTypes
     */
    public function listJobs(User $user, Request $request, callable $can, ?array $restrictToJobTypes = null): JsonResponse
    {
        $query = GenAiImportJob::where('user_id', $user->id)
            ->where('status', '!=', 'imported')
            ->orderBy('created_at', 'desc')
            ->with('results');

        $jobType = $request->query('job_type');
        if ($jobType) {
            if (! in_array($jobType, GenAiImportJob::VALID_JOB_TYPES, true)) {
                return response()->json(['error' => 'Invalid job_type.'], 422);
            }
            if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, (string) $jobType)) !== null) {
                return $rejected;
            }
            if (($denied = $this->authorizeJobType($can, (string) $jobType)) !== null) {
                return $denied;
            }
            $query->where('job_type', $jobType);
        } else {
            if ($restrictToJobTypes !== null) {
                $query->whereIn('job_type', $restrictToJobTypes);
            }

            // No explicit filter: never leak restricted job types (and their
            // parsed results) the user is not authorized for. Reuse the same
            // job_type -> permission mapping as the per-type authorization.
            $blocked = array_values(array_filter(
                GenAiImportJob::VALID_JOB_TYPES,
                function (string $type) use ($can): bool {
                    $permission = $this->permissionForJobType($type);

                    return $permission !== null && ! $can($permission);
                }
            ));
            if ($blocked !== []) {
                $query->whereNotIn('job_type', $blocked);
            }
        }

        $acctId = $request->query('acct_id');
        if ($acctId) {
            $ownsAccount = FinAccounts::where('acct_id', (int) $acctId)
                ->where('acct_owner', $user->id)
                ->exists();
            if (! $ownsAccount) {
                return response()->json(['error' => 'Account not found or access denied.'], 403);
            }
            $query->where('acct_id', (int) $acctId);
        }

        $limit = $jobType ? self::FILTERED_JOB_LIMIT : self::DEFAULT_JOB_LIMIT;
        $jobs = $query->limit($limit)->get();

        return response()->json(['data' => $jobs]);
    }

    /**
     * Show a specific import job with results.
     *
     * @param  callable(string): bool  $can
     * @param  list<string>|null  $restrictToJobTypes
     */
    public function showJob(User $user, int $jobId, callable $can, ?array $restrictToJobTypes = null): JsonResponse
    {
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->with('results')
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, $job->job_type)) !== null) {
            return $rejected;
        }

        if (($denied = $this->authorizeJobType($can, $job->job_type)) !== null) {
            return $denied;
        }

        return response()->json($job);
    }

    /**
     * Retry a failed job.
     *
     * @param  callable(string): bool  $can
     * @param  list<string>|null  $restrictToJobTypes
     * @param  (callable(GenAiImportJob): void)|null  $beforeRetry  Hook invoked with the job after
     *                                                              authorization and retryability checks; may throw to abort the retry.
     */
    public function retryJob(User $user, int $jobId, callable $can, ?array $restrictToJobTypes = null, ?callable $beforeRetry = null): JsonResponse
    {
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, $job->job_type)) !== null) {
            return $rejected;
        }

        if (($denied = $this->authorizeJobType($can, $job->job_type)) !== null) {
            return $denied;
        }

        if (! $job->canRetry()) {
            return response()->json(['error' => 'Maximum retry count reached or job is not in a failed state.'], 422);
        }

        if ($beforeRetry !== null) {
            $beforeRetry($job);
        }

        $job->update([
            'status' => 'pending',
            'error_message' => null,
        ]);

        ParseImportJob::dispatch($job->id);

        return response()->json([
            'job_id' => $job->id,
            'status' => 'pending',
        ]);
    }

    /**
     * Delete a job, its results, and the S3 file.
     *
     * @param  list<string>|null  $restrictToJobTypes
     */
    public function deleteJob(User $user, int $jobId, ?array $restrictToJobTypes = null): JsonResponse
    {
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        if (($rejected = $this->rejectRestrictedJobType($restrictToJobTypes, $job->job_type)) !== null) {
            return $rejected;
        }

        // Delete job (cascade deletes results; model boot deletes S3 file)
        $job->delete();

        return response()->json(['success' => true]);
    }
}
