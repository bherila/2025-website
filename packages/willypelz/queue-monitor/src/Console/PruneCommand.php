<?php

declare(strict_types=1);

namespace QueueMonitor\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use QueueMonitor\Contracts\QueueMonitorRepository;

class PruneCommand extends Command
{
    protected $signature = 'queue-monitor:prune {--days=14 : Number of days to retain}';

    protected $description = 'Prune old queue monitor job records';

    public function handle(QueueMonitorRepository $repository): int
    {
        $days = (int) $this->option('days');
        $before = Carbon::now()->subDays($days);

        $deleted = $repository->prune($before);

        $this->info("Pruned {$deleted} job records older than {$days} days.");

        return self::SUCCESS;
    }
}

