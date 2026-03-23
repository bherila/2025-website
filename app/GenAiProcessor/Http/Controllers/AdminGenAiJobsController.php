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
}
