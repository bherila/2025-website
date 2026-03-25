<?php

namespace App\GenAiProcessor\Http\Controllers;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\FinanceTool\FinAccounts;
use App\Services\FileStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class GenAiImportController extends Controller
{
    public function __construct(
        private FileStorageService $fileService,
        private GenAiJobDispatcherService $dispatcher,
    ) {}

    /**
     * Generate a pre-signed S3 upload URL.
     * POST /api/genai/import/request-upload
     */
    public function requestUpload(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'filename' => 'required|string|max:255',
            'content_type' => 'required|string|max:128',
            'file_size' => 'required|integer|min:1|max:52428800', // 50MB max
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = Auth::user();
        $filename = $request->input('filename');
        $contentType = $request->input('content_type');

        // Generate S3 key using convention: genai-import/{user_id}/{date} {random} {filename}
        $sanitizedFilename = preg_replace('/[^\w.\-]/', '_', $filename);
        $date = now()->format('Y.m.d');
        $random = substr(bin2hex(random_bytes(4)), 0, 5);
        $s3Key = "genai-import/{$user->id}/{$date} {$random} {$sanitizedFilename}";

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
     * Create a new import job after file has been uploaded to S3.
     * POST /api/genai/import/jobs
     */
    public function createJob(Request $request): JsonResponse
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

        $user = Auth::user();
        $jobType = $request->input('job_type');
        $context = $request->input('context');

        // Validate context schema against job_type to prevent injection
        try {
            $this->dispatcher->validateContext($jobType, $context);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
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
     * List the current user's import jobs.
     * GET /api/genai/import/jobs
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();

        $query = GenAiImportJob::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->with('results');

        $jobType = $request->query('job_type');
        if ($jobType) {
            if (! in_array($jobType, GenAiImportJob::VALID_JOB_TYPES, true)) {
                return response()->json(['error' => 'Invalid job_type.'], 422);
            }
            $query->where('job_type', $jobType);
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

        $limit = $jobType ? 50 : 20;
        $jobs = $query->limit($limit)->get();

        return response()->json(['data' => $jobs]);
    }

    /**
     * Show a specific import job with results.
     * GET /api/genai/import/jobs/{job_id}
     */
    public function show(int $jobId): JsonResponse
    {
        $user = Auth::user();
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->with('results')
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        return response()->json($job);
    }

    /**
     * Retry a failed job.
     * POST /api/genai/import/jobs/{job_id}/retry
     */
    public function retry(int $jobId): JsonResponse
    {
        $user = Auth::user();
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        if (! $job->canRetry()) {
            return response()->json(['error' => 'Maximum retry count reached or job is not in a failed state.'], 422);
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
     * DELETE /api/genai/import/jobs/{job_id}
     */
    public function destroy(int $jobId): JsonResponse
    {
        $user = Auth::user();
        $job = GenAiImportJob::where('id', $jobId)
            ->where('user_id', $user->id)
            ->first();

        if (! $job) {
            return response()->json(['error' => 'Job not found.'], 404);
        }

        // Delete S3 file
        try {
            $this->fileService->deleteFile($job->s3_path);
        } catch (\Throwable $e) {
            Log::warning('Failed to delete S3 file for GenAI job', [
                'job_id' => $job->id,
                's3_path' => $job->s3_path,
                'error' => $e->getMessage(),
            ]);
        }

        // Delete job (cascade deletes results)
        $job->delete();

        return response()->json(['success' => true]);
    }
}
