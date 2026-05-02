<?php

namespace App\GenAiProcessor\Http\Controllers;

use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Gate;

class AdminGenAiJobsController extends Controller
{
    /**
     * List all GenAI jobs (admin view, paginated, most recent first).
     * GET /api/admin/genai-jobs
     */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('admin');

        $perPage = min((int) $request->input('per_page', 25), 100);

        $jobs = GenAiImportJob::with(['user:id,name,email', 'results'])
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json($jobs);
    }

    /**
     * Show a single GenAI job with full details (including raw result JSON).
     * GET /api/admin/genai-jobs/{id}
     */
    public function show(int $id): JsonResponse
    {
        Gate::authorize('admin');

        $job = GenAiImportJob::with(['user:id,name,email', 'results'])
            ->findOrFail($id);

        return response()->json($job);
    }

    /**
     * Admin: Requeue/Retry a failed job.
     * POST /api/admin/genai-jobs/{id}/requeue
     */
    public function retry(int $id): JsonResponse
    {
        Gate::authorize('admin');

        $job = GenAiImportJob::findOrFail($id);

        // Admins can retry even if MAX_RETRIES reached
        if ($job->status !== 'failed') {
            return response()->json(['error' => 'Job is not in a failed state.'], 422);
        }

        // Clear previous results/errors to start fresh
        $job->results()->delete();
        $job->update([
            'status' => 'pending',
            'error_message' => null,
            'raw_response' => null,
            'retry_count' => 0,
            'ai_configuration_id' => null,
            'ai_provider' => null,
            'ai_model' => null,
            'input_tokens' => null,
            'output_tokens' => null,
        ]);

        // Note: We don't dispatch here; we let the scheduled task / cron pick it up as requested.
        // If immediate dispatch is desired, uncomment the line below:
        // \App\GenAiProcessor\Jobs\ParseImportJob::dispatch($job->id);

        return response()->json([
            'success' => true,
            'job' => $job->load(['user:id,name,email', 'results']),
        ]);
    }
}
