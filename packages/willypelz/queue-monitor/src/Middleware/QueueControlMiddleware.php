<?php

declare(strict_types=1);

namespace QueueMonitor\Middleware;

use Illuminate\Support\Facades\Cache;
use QueueMonitor\Services\QueueControlService;

class QueueControlMiddleware
{
    public function __construct(private QueueControlService $controlService)
    {
    }

    public function handle($job, $next)
    {
        $connection = $job->getConnectionName();
        $queue = $job->getQueue();

        // Check if queue is paused
        if ($this->controlService->isPaused($connection, $queue)) {
            $releaseSeconds = config('queue-monitor.control.pause_release_seconds', 10);
            $job->release($releaseSeconds);
            return;
        }

        // Check throttling
        $throttleRate = $this->controlService->getThrottleRate($connection, $queue);
        if ($throttleRate !== null) {
            $cacheKey = "queue-throttle:{$connection}:{$queue}";
            $processed = Cache::get($cacheKey, 0);

            if ($processed >= $throttleRate) {
                $releaseSeconds = config('queue-monitor.control.throttle_release_seconds', 5);
                $job->release($releaseSeconds);
                return;
            }

            Cache::increment($cacheKey);
            Cache::put($cacheKey, $processed + 1, now()->addMinute());
        }

        $next($job);
    }
}

