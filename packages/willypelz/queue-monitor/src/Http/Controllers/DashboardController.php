<?php

declare(strict_types=1);

namespace QueueMonitor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use QueueMonitor\Contracts\QueueMonitorRepository;

class DashboardController extends Controller
{
    public function __construct(private QueueMonitorRepository $repository)
    {
    }

    public function index()
    {
        return view('queue-monitor::dashboard');
    }

    public function stats(Request $request): JsonResponse
    {
        $minutes = (int) $request->query('minutes', 60);
        $stats = $this->repository->dashboardStats($minutes);

        return response()->json($stats);
    }

    public function jobs(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 50);
        $jobs = $this->repository->recentJobs($limit);

        return response()->json(['jobs' => $jobs]);
    }
}

