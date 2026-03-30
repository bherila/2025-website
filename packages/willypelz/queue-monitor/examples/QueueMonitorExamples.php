<?php

/**
 * Example usage of Queue Monitor package
 *
 * This file demonstrates common use cases and patterns.
 */

namespace App\Examples;

use App\Jobs\ProcessOrder;
use App\Jobs\SendEmail;
use Illuminate\Support\Facades\Queue;
use QueueMonitor\Services\QueueControlService;
use QueueMonitor\Contracts\QueueMonitorRepository;

class QueueMonitorExamples
{
    public function __construct(
        private QueueControlService $controlService,
        private QueueMonitorRepository $repository
    ) {
    }

    /**
     * Example 1: Pause queue during maintenance
     */
    public function pauseDuringMaintenance(): void
    {
        // Pause the default queue
        $this->controlService->pause('database', 'default');

        // Perform maintenance...

        // Resume the queue
        $this->controlService->resume('database', 'default');
    }

    /**
     * Example 2: Throttle API requests
     */
    public function throttleApiCalls(): void
    {
        // Limit to 30 API calls per minute
        $this->controlService->throttle('database', 'api-requests', 30);

        // Dispatch jobs - they'll be throttled automatically
        for ($i = 0; $i < 100; $i++) {
            dispatch(new \App\Jobs\MakeApiRequest())->onQueue('api-requests');
        }
    }

    /**
     * Example 3: Monitor queue health
     */
    public function checkQueueHealth(): array
    {
        $stats = $this->repository->dashboardStats(60);

        $health = [
            'status' => 'healthy',
            'warnings' => [],
        ];

        // Check failure rate
        if ($stats['total'] > 0) {
            $failureRate = ($stats['failed'] / $stats['total']) * 100;
            if ($failureRate > 5) {
                $health['status'] = 'warning';
                $health['warnings'][] = "High failure rate: {$failureRate}%";
            }
        }

        // Check for stuck jobs
        if ($stats['processing'] > 50) {
            $health['status'] = 'warning';
            $health['warnings'][] = "Many jobs stuck processing";
        }

        return $health;
    }

    /**
     * Example 4: Conditional job dispatching based on queue status
     */
    public function dispatchWithCheck(string $queue = 'default'): void
    {
        // Check if queue is paused
        if ($this->controlService->isPaused('database', $queue)) {
            // Log or handle paused state
            logger()->info("Queue {$queue} is paused, job not dispatched");
            return;
        }

        // Dispatch job
        dispatch(new ProcessOrder(123))->onQueue($queue);
    }

    /**
     * Example 5: Retry failed jobs after fixing an issue
     */
    public function retryAfterFix(): void
    {
        // Fix was deployed, retry all failed jobs
        $this->controlService->retry('database', 'default');
    }

    /**
     * Example 6: Get detailed statistics
     */
    public function getDetailedStats(): array
    {
        $stats = $this->repository->dashboardStats(1440); // Last 24 hours
        $recentJobs = $this->repository->recentJobs(100);

        return [
            'summary' => $stats,
            'recent_jobs' => $recentJobs,
            'avg_runtime_seconds' => $stats['avg_runtime_ms'] / 1000,
            'success_rate' => $stats['total'] > 0
                ? (($stats['processed'] / $stats['total']) * 100)
                : 0,
        ];
    }

    /**
     * Example 7: Dynamic throttling based on time of day
     */
    public function dynamicThrottling(): void
    {
        $hour = now()->hour;

        if ($hour >= 9 && $hour <= 17) {
            // Business hours - higher rate
            $this->controlService->throttle('database', 'emails', 100);
        } else {
            // Off hours - lower rate to save resources
            $this->controlService->throttle('database', 'emails', 20);
        }
    }

    /**
     * Example 8: Queue-specific monitoring
     */
    public function monitorSpecificQueue(string $connection, string $queue): array
    {
        $jobs = $this->repository->recentJobs(1000);

        // Filter by specific queue
        $queueJobs = array_filter($jobs, function ($job) use ($connection, $queue) {
            return $job['connection'] === $connection && $job['queue'] === $queue;
        });

        $total = count($queueJobs);
        $failed = count(array_filter($queueJobs, fn($j) => $j['status'] === 'failed'));
        $processed = count(array_filter($queueJobs, fn($j) => $j['status'] === 'processed'));

        return [
            'queue' => $queue,
            'total' => $total,
            'failed' => $failed,
            'processed' => $processed,
            'failure_rate' => $total > 0 ? ($failed / $total) * 100 : 0,
        ];
    }
}

