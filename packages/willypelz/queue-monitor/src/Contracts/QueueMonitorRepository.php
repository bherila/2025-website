<?php

declare(strict_types=1);

namespace QueueMonitor\Contracts;

use DateTimeInterface;

interface QueueMonitorRepository
{
    public function recordProcessing(array $data): void;

    public function recordProcessed(string $jobId, array $data): void;

    public function recordFailed(string $jobId, array $data): void;

    public function prune(DateTimeInterface $before): int;

    public function dashboardStats(int $minutes = 60): array;

    public function recentJobs(int $limit = 50): array;

    public function setControl(string $connection, string $queue, string $type, array $data): void;

    public function getControl(string $connection, string $queue, string $type): ?array;
}

