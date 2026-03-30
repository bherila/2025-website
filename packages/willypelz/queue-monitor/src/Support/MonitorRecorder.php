<?php

declare(strict_types=1);

namespace QueueMonitor\Support;

use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use QueueMonitor\Contracts\QueueMonitorRepository;

class MonitorRecorder
{
    public function __construct(private QueueMonitorRepository $repository)
    {
    }

    public function recordProcessing(JobProcessing $event): void
    {
        $job = $event->job;
        $payload = $job->payload();

        $jobId = $this->resolveJobId($job, $payload);
        $uuid = $payload['uuid'] ?? null;

        $this->repository->recordProcessing([
            'job_id' => $jobId,
            'uuid' => $uuid,
            'connection' => $event->connectionName ?? $job->getConnectionName(),
            'queue' => $job->getQueue(),
            'name' => $job->resolveName(),
            'attempts' => $job->attempts(),
            'payload' => $payload,
            'started_at' => Carbon::now(),
        ]);
    }

    public function recordProcessed(JobProcessed $event): void
    {
        $job = $event->job;
        $payload = $job->payload();
        $jobId = $this->resolveJobId($job, $payload);

        $this->repository->recordProcessed($jobId, [
            'connection' => $event->connectionName ?? $job->getConnectionName(),
            'queue' => $job->getQueue(),
            'finished_at' => Carbon::now(),
        ]);
    }

    public function recordFailed(JobFailed $event): void
    {
        $job = $event->job;
        $payload = $job->payload();
        $jobId = $this->resolveJobId($job, $payload);
        $finishedAt = Carbon::now();

        $this->repository->recordFailed($jobId, [
            'connection' => $event->connectionName ?? $job->getConnectionName(),
            'queue' => $job->getQueue(),
            'finished_at' => $finishedAt,
            'exception' => $event->exception->getMessage(),
        ]);
    }

    private function resolveJobId(object $job, array $payload): string
    {
        if (method_exists($job, 'getJobId')) {
            return (string) $job->getJobId();
        }

        if (isset($payload['uuid'])) {
            return (string) $payload['uuid'];
        }

        return (string) Str::uuid();
    }
}
