<?php

declare(strict_types=1);

namespace QueueMonitor\Services;

use Illuminate\Support\Carbon;
use QueueMonitor\Contracts\QueueMonitorRepository;

class QueueControlService
{
    public function __construct(private QueueMonitorRepository $repository)
    {
    }

    public function pause(string $connection, string $queue): void
    {
        $this->repository->setControl($connection, $queue, 'pause', [
            'enabled' => true,
            'paused_at' => Carbon::now()->toIso8601String(),
        ]);
    }

    public function resume(string $connection, string $queue): void
    {
        $this->repository->setControl($connection, $queue, 'pause', [
            'enabled' => false,
            'resumed_at' => Carbon::now()->toIso8601String(),
        ]);
    }

    public function throttle(string $connection, string $queue, int $ratePerMinute): void
    {
        $this->repository->setControl($connection, $queue, 'throttle', [
            'enabled' => true,
            'rate_per_minute' => $ratePerMinute,
            'throttled_at' => Carbon::now()->toIso8601String(),
        ]);
    }

    public function isPaused(string $connection, string $queue): bool
    {
        $control = $this->repository->getControl($connection, $queue, 'pause');
        return $control && ($control['data']['enabled'] ?? false);
    }

    public function getThrottleRate(string $connection, string $queue): ?int
    {
        $control = $this->repository->getControl($connection, $queue, 'throttle');

        if (!$control || !($control['data']['enabled'] ?? false)) {
            return null;
        }

        return $control['data']['rate_per_minute'] ?? null;
    }
}

