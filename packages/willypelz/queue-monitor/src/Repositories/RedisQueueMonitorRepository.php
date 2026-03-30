<?php

declare(strict_types=1);

namespace QueueMonitor\Repositories;

use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Redis;
use QueueMonitor\Contracts\QueueMonitorRepository;

class RedisQueueMonitorRepository implements QueueMonitorRepository
{
    private const KEY_PREFIX = 'queue_monitor:';
    private const JOBS_KEY = 'jobs';
    private const CONTROLS_KEY = 'controls';
    private const STATS_KEY = 'stats';
    private const INDEX_KEY = 'index';

    /**
     * Get the Redis connection name from config.
     */
    protected function getConnection(): string
    {
        return config('queue-monitor.redis.connection', 'default');
    }

    /**
     * Get the Redis client.
     */
    protected function redis()
    {
        try {
            return Redis::connection($this->getConnection());
        } catch (\Exception $e) {
            throw new \RuntimeException(
                "Redis connection [{$this->getConnection()}] is not configured. "
                . "Please configure Redis or set QUEUE_MONITOR_DRIVER=database in your .env file.",
                0,
                $e
            );
        }
    }

    /**
     * Generate a unique key for a job.
     */
    protected function jobKey(string $jobId, string $connection, string $queue): string
    {
        return self::KEY_PREFIX . self::JOBS_KEY . ":{$connection}:{$queue}:{$jobId}";
    }

    /**
     * Generate a key for the job index (sorted set for ordering).
     */
    protected function indexKey(): string
    {
        return self::KEY_PREFIX . self::INDEX_KEY;
    }

    /**
     * Generate a key for job stats.
     */
    protected function statsKey(): string
    {
        return self::KEY_PREFIX . self::STATS_KEY;
    }

    /**
     * Generate a key for queue controls.
     */
    protected function controlKey(string $connection, string $queue, string $type): string
    {
        return self::KEY_PREFIX . self::CONTROLS_KEY . ":{$connection}:{$queue}:{$type}";
    }

    public function recordProcessing(array $data): void
    {
        $key = $this->jobKey($data['job_id'], $data['connection'], $data['queue']);
        $timestamp = $data['started_at']->getTimestamp();

        $jobData = [
            'id' => $data['job_id'],
            'job_id' => $data['job_id'],
            'uuid' => $data['uuid'],
            'connection' => $data['connection'],
            'queue' => $data['queue'],
            'name' => $data['name'],
            'status' => 'processing',
            'attempts' => $data['attempts'],
            'payload' => json_encode($data['payload']),
            'started_at' => $data['started_at']->toIso8601String(),
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ];

        // Store job data as a hash
        $this->redis()->hMSet($key, $jobData);

        // Add to sorted set for ordering and expiration
        $this->redis()->zAdd($this->indexKey(), $timestamp, $key);

        // Set TTL based on retention days
        $ttl = config('queue-monitor.retention_days', 14) * 86400;
        $this->redis()->expire($key, $ttl);

        // Increment processing count
        $this->redis()->hIncrBy($this->statsKey(), 'total', 1);
        $this->redis()->hIncrBy($this->statsKey(), 'processing', 1);
    }

    public function recordProcessed(string $jobId, array $data): void
    {
        $key = $this->jobKey($jobId, $data['connection'], $data['queue']);

        if (!$this->redis()->exists($key)) {
            return;
        }

        $jobData = $this->redis()->hGetAll($key);

        if (empty($jobData)) {
            return;
        }

        $finishedAt = $data['finished_at'];
        $startedAt = isset($jobData['started_at']) ? Carbon::parse($jobData['started_at']) : null;
        $runtimeMs = $startedAt ? (int) round($startedAt->diffInMilliseconds($finishedAt)) : null;

        // Update job data
        $this->redis()->hMSet($key, [
            'status' => 'processed',
            'finished_at' => $finishedAt->toIso8601String(),
            'runtime_ms' => $runtimeMs ?? 0,
            'updated_at' => now()->toIso8601String(),
        ]);

        // Update stats
        $this->redis()->hIncrBy($this->statsKey(), 'processed', 1);
        $this->redis()->hIncrBy($this->statsKey(), 'processing', -1);

        // Track runtime for average calculation
        if ($runtimeMs !== null) {
            $this->redis()->lPush(self::KEY_PREFIX . 'runtimes', $runtimeMs);
            $this->redis()->lTrim(self::KEY_PREFIX . 'runtimes', 0, 999); // Keep last 1000 runtimes
        }
    }

    public function recordFailed(string $jobId, array $data): void
    {
        $key = $this->jobKey($jobId, $data['connection'], $data['queue']);

        if (!$this->redis()->exists($key)) {
            return;
        }

        $jobData = $this->redis()->hGetAll($key);

        if (empty($jobData)) {
            return;
        }

        $finishedAt = $data['finished_at'];
        $startedAt = isset($jobData['started_at']) ? Carbon::parse($jobData['started_at']) : null;
        $runtimeMs = $startedAt ? (int) round($startedAt->diffInMilliseconds($finishedAt)) : null;

        // Update job data
        $this->redis()->hMSet($key, [
            'status' => 'failed',
            'finished_at' => $finishedAt->toIso8601String(),
            'runtime_ms' => $runtimeMs ?? 0,
            'exception' => $data['exception'] ?? '',
            'updated_at' => now()->toIso8601String(),
        ]);

        // Update stats
        $this->redis()->hIncrBy($this->statsKey(), 'failed', 1);
        $this->redis()->hIncrBy($this->statsKey(), 'processing', -1);
    }

    public function prune(DateTimeInterface $before): int
    {
        $timestamp = $before->getTimestamp();
        $indexKey = $this->indexKey();

        // Get all job keys before the timestamp
        $keys = $this->redis()->zRangeByScore($indexKey, '-inf', $timestamp);

        if (empty($keys)) {
            return 0;
        }

        $count = count($keys);

        // Delete the job keys
        foreach ($keys as $key) {
            $this->redis()->del($key);
        }

        // Remove from index
        $this->redis()->zRemRangeByScore($indexKey, '-inf', $timestamp);

        return $count;
    }

    public function dashboardStats(int $minutes = 60): array
    {
        $statsKey = $this->statsKey();
        $stats = $this->redis()->hGetAll($statsKey);

        // Calculate average runtime from recent jobs
        $runtimes = $this->redis()->lRange(self::KEY_PREFIX . 'runtimes', 0, -1);
        $avgRuntime = !empty($runtimes) ? (int) (array_sum($runtimes) / count($runtimes)) : 0;

        return [
            'total' => (int) ($stats['total'] ?? 0),
            'processed' => (int) ($stats['processed'] ?? 0),
            'failed' => (int) ($stats['failed'] ?? 0),
            'processing' => (int) ($stats['processing'] ?? 0),
            'avg_runtime_ms' => $avgRuntime,
        ];
    }

    public function recentJobs(int $limit = 50): array
    {
        $indexKey = $this->indexKey();

        // Get recent job keys (ordered by timestamp, most recent first)
        $keys = $this->redis()->zRevRange($indexKey, 0, $limit - 1);

        if (empty($keys)) {
            return [];
        }

        $jobs = [];
        foreach ($keys as $key) {
            $jobData = $this->redis()->hGetAll($key);

            if (!empty($jobData)) {
                // Convert payload back to array if needed
                if (isset($jobData['payload']) && is_string($jobData['payload'])) {
                    $jobData['payload'] = json_decode($jobData['payload'], true);
                }

                // Convert numeric strings to integers
                if (isset($jobData['attempts'])) {
                    $jobData['attempts'] = (int) $jobData['attempts'];
                }
                if (isset($jobData['runtime_ms'])) {
                    $jobData['runtime_ms'] = (int) $jobData['runtime_ms'];
                }

                $jobs[] = $jobData;
            }
        }

        return $jobs;
    }

    public function setControl(string $connection, string $queue, string $type, array $data): void
    {
        $key = $this->controlKey($connection, $queue, $type);

        $controlData = [
            'connection' => $connection,
            'queue' => $queue,
            'type' => $type,
            'data' => json_encode($data),
            'created_at' => now()->toIso8601String(),
            'updated_at' => now()->toIso8601String(),
        ];

        $this->redis()->hMSet($key, $controlData);

        // Set TTL for control data (e.g., 1 day)
        $this->redis()->expire($key, 86400);
    }

    public function getControl(string $connection, string $queue, string $type): ?array
    {
        $key = $this->controlKey($connection, $queue, $type);
        $controlData = $this->redis()->hGetAll($key);

        if (empty($controlData)) {
            return null;
        }

        // Decode the data field
        if (isset($controlData['data']) && is_string($controlData['data'])) {
            $controlData['data'] = json_decode($controlData['data'], true);
        }

        return $controlData;
    }

    /**
     * Clear all queue monitor data from Redis (useful for testing).
     */
    public function clear(): void
    {
        $keys = $this->redis()->keys(self::KEY_PREFIX . '*');

        if (!empty($keys)) {
            $this->redis()->del(...$keys);
        }
    }

    /**
     * Reset stats counters.
     */
    public function resetStats(): void
    {
        $this->redis()->del($this->statsKey());
        $this->redis()->del(self::KEY_PREFIX . 'runtimes');
    }
}


