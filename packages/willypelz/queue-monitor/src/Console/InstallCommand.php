<?php

declare(strict_types=1);

namespace QueueMonitor\Console;

use Illuminate\Console\Command;

class InstallCommand extends Command
{
    protected $signature = 'queue-monitor:install';

    protected $description = 'Install the Queue Monitor package';

    public function handle(): int
    {
        $this->info('Installing Queue Monitor...');

        $this->call('vendor:publish', [
            '--tag' => 'queue-monitor-config',
        ]);

        $this->call('vendor:publish', [
            '--tag' => 'queue-monitor-migrations',
        ]);

        $this->info('Running migrations...');
        $this->call('migrate');

        $this->newLine();
        $this->info('Queue Monitor installed successfully!');
        $this->newLine();
        $this->info('Visit http://your-app.test/queue-monitor to access the dashboard.');
        $this->newLine();
        $this->comment('To secure the dashboard, update the middleware in config/queue-monitor.php');
        $this->newLine();

        return self::SUCCESS;
    }
}

