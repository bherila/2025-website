<?php

namespace App\GenAiProcessor\Http\Controllers;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiImportService;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\User;
use App\Support\Access\FeatureAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Web (session-auth) surface over the shared GenAI import workflow.
 * Business logic lives in GenAiImportService so the agent API controller
 * can reuse it without duplication.
 */
class GenAiImportController extends Controller
{
    public function __construct(
        private GenAiImportService $importService,
        private GenAiJobDispatcherService $dispatcher,
        private FeatureAccess $featureAccess,
    ) {}

    /** @return callable(string): bool */
    private function permissionChecker(User $user): callable
    {
        return fn (string $permission): bool => $this->featureAccess->can($user, $permission);
    }

    /**
     * Generate a pre-signed S3 upload URL.
     * POST /api/genai/import/request-upload
     */
    public function requestUpload(Request $request): JsonResponse
    {
        $user = Auth::user();

        return $this->importService->requestUpload($user, $request, $this->permissionChecker($user));
    }

    /**
     * Create a new import job after file has been uploaded to S3.
     * POST /api/genai/import/jobs
     */
    public function createJob(Request $request): JsonResponse
    {
        $user = Auth::user();

        return $this->importService->createJob($user, $request, $this->permissionChecker($user));
    }

    /**
     * Create a new import job from pasted text (no S3 upload).
     * POST /api/genai/import/paste
     */
    public function paste(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'text' => 'required|string|max:200000',
            'job_type' => 'required|string|in:class_action_email',
            'context_json' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = Auth::user();
        $text = trim((string) $request->input('text'));
        $jobType = (string) $request->input('job_type');
        if (($denied = $this->importService->authorizeJobType($this->permissionChecker($user), $jobType)) !== null) {
            return $denied;
        }
        /** @var array<string, mixed> $context */
        $context = $request->input('context_json', []);
        $context['pasted_text'] = $text;

        try {
            $this->dispatcher->validateContext($jobType, $context);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $fileHash = hash('sha256', $text);

        $existing = GenAiImportJob::query()
            ->where('file_hash', $fileHash)
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
            'job_type' => $jobType,
            'file_hash' => $fileHash,
            'original_filename' => 'pasted-import.txt',
            's3_path' => 'inline://paste/'.Str::uuid(),
            'mime_type' => 'text/plain',
            'file_size_bytes' => strlen($text),
            'context_json' => json_encode($context),
            'status' => 'pending',
        ]);

        ParseImportJob::dispatch($job->id);

        return response()->json([
            'job_id' => $job->id,
            'status' => $job->status,
        ], 201);
    }

    /**
     * List the current user's import jobs.
     * GET /api/genai/import/jobs
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();

        return $this->importService->listJobs($user, $request, $this->permissionChecker($user));
    }

    /**
     * Show a specific import job with results.
     * GET /api/genai/import/jobs/{job_id}
     */
    public function show(int $jobId): JsonResponse
    {
        $user = Auth::user();

        return $this->importService->showJob($user, $jobId, $this->permissionChecker($user));
    }

    /**
     * Retry a failed job.
     * POST /api/genai/import/jobs/{job_id}/retry
     */
    public function retry(int $jobId): JsonResponse
    {
        $user = Auth::user();

        return $this->importService->retryJob($user, $jobId, $this->permissionChecker($user));
    }

    /**
     * Delete a job, its results, and the S3 file.
     * DELETE /api/genai/import/jobs/{job_id}
     */
    public function destroy(int $jobId): JsonResponse
    {
        return $this->importService->deleteJob(Auth::user(), $jobId);
    }
}
