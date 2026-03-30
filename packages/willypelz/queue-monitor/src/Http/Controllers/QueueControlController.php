<?php

declare(strict_types=1);

namespace QueueMonitor\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Artisan;
use QueueMonitor\Contracts\QueueMonitorRepository;
use QueueMonitor\Services\QueueControlService;

class QueueControlController extends Controller
{
    public function __construct(
        private QueueMonitorRepository $repository,
        private QueueControlService $controlService
    ) {
    }

    public function pause(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'connection' => 'required|string',
            'queue' => 'required|string',
        ]);

        $this->controlService->pause($validated['connection'], $validated['queue']);

        return response()->json([
            'success' => true,
            'message' => "Queue {$validated['queue']} on {$validated['connection']} paused.",
        ]);
    }

    public function resume(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'connection' => 'required|string',
            'queue' => 'required|string',
        ]);

        $this->controlService->resume($validated['connection'], $validated['queue']);

        return response()->json([
            'success' => true,
            'message' => "Queue {$validated['queue']} on {$validated['connection']} resumed.",
        ]);
    }

    public function throttle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'connection' => 'required|string',
            'queue' => 'required|string',
            'rate' => 'required|integer|min:1',
        ]);

        $this->controlService->throttle(
            $validated['connection'],
            $validated['queue'],
            $validated['rate']
        );

        return response()->json([
            'success' => true,
            'message' => "Queue {$validated['queue']} throttled to {$validated['rate']} jobs/min.",
        ]);
    }

    public function retry(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'connection' => 'required|string',
            'queue' => 'required|string',
        ]);

        // Trigger Laravel's retry mechanism
        Artisan::call('queue:retry', [
            '--queue' => $validated['queue'],
        ]);

        return response()->json([
            'success' => true,
            'message' => "Retrying failed jobs on {$validated['queue']}.",
        ]);
    }
}

