<?php

declare(strict_types=1);

namespace QueueMonitor\Repositories;

use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use QueueMonitor\Contracts\QueueMonitorRepository;
use QueueMonitor\Models\QueueMonitorControl;
use QueueMonitor\Models\QueueMonitorJob;

class DatabaseQueueMonitorRepository implements QueueMonitorRepository
{
    public function recordProcessing(array $data): void
    {
        QueueMonitorJob::updateOrCreate(
            [
                'job_id' => $data['job_id'],
                'connection' => $data['connection'],
                'queue' => $data['queue'],
            ],
            [
                'uuid' => $data['uuid'],
                'name' => $data['name'],
                'status' => 'processing',
                'attempts' => $data['attempts'],
                'payload' => $data['payload'],
                'started_at' => $data['started_at'],
            ]
        );
    }

    public function recordProcessed(string $jobId, array $data): void
    {
        $job = QueueMonitorJob::query()
            ->where('job_id', $jobId)
            ->where('connection', $data['connection'])
            ->where('queue', $data['queue'])
            ->latest('id')
            ->first();

        if ($job === null) {
            return;
        }

        $finishedAt = $data['finished_at'];
        $runtimeMs = $job->started_at ? (int) round($job->started_at->diffInMilliseconds($finishedAt)) : null;

        $job->update([
            'status' => 'processed',
            'finished_at' => $finishedAt,
            'runtime_ms' => $runtimeMs,
        ]);
    }

    public function recordFailed(string $jobId, array $data): void
    {
        $job = QueueMonitorJob::query()
            ->where('job_id', $jobId)
            ->where('connection', $data['connection'])
            ->where('queue', $data['queue'])
            ->latest('id')
            ->first();

        if ($job === null) {
            return;
        }

        $finishedAt = $data['finished_at'];
        $runtimeMs = $job->started_at ? (int) round($job->started_at->diffInMilliseconds($finishedAt)) : null;

        $job->update([
            'status' => 'failed',
            'finished_at' => $finishedAt,
            'runtime_ms' => $runtimeMs,
            'exception' => $data['exception'],
        ]);
    }

    public function prune(DateTimeInterface $before): int
    {
        return QueueMonitorJob::query()
            ->where('created_at', '<', $before)
            ->delete();
    }

    public function dashboardStats(int $minutes = 60): array
    {
        $since = Carbon::now()->subMinutes($minutes);

        $summary = QueueMonitorJob::query()
            ->select([
                DB::raw("COUNT(*) as total"),
                DB::raw("SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed"),
                DB::raw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed"),
                DB::raw("SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing"),
                DB::raw("AVG(runtime_ms) as avg_runtime_ms"),
            ])
            ->where('created_at', '>=', $since)
            ->first();

        return [
            'total' => (int) ($summary->total ?? 0),
            'processed' => (int) ($summary->processed ?? 0),
            'failed' => (int) ($summary->failed ?? 0),
            'processing' => (int) ($summary->processing ?? 0),
            'avg_runtime_ms' => (int) ($summary->avg_runtime_ms ?? 0),
        ];
    }

    public function recentJobs(int $limit = 50): array
    {
        return QueueMonitorJob::query()
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    public function setControl(string $connection, string $queue, string $type, array $data): void
    {
        QueueMonitorControl::updateOrCreate(
            [
                'connection' => $connection,
                'queue' => $queue,
                'type' => $type,
            ],
            [
                'data' => $data,
                'updated_at' => Carbon::now(),
                'created_at' => Carbon::now(),
            ]
        );
    }

    public function getControl(string $connection, string $queue, string $type): ?array
    {
        $control = QueueMonitorControl::query()
            ->where('connection', $connection)
            ->where('queue', $queue)
            ->where('type', $type)
            ->first();

        return $control ? $control->toArray() : null;
    }
}

