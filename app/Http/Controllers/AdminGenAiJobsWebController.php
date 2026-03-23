<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Gate;

class AdminGenAiJobsWebController extends Controller
{
    /**
     * Show the Admin GenAI Jobs page.
     * GET /admin/genai-jobs
     */
    public function index()
    {
        Gate::authorize('admin');

        return view('admin.genai-jobs');
    }
}
