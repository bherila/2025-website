<?php

declare(strict_types=1);

namespace QueueMonitor;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use QueueMonitor\Console\PruneCommand;
use QueueMonitor\Contracts\QueueMonitorRepository;
use QueueMonitor\Repositories\DatabaseQueueMonitorRepository;
use QueueMonitor\Repositories\RedisQueueMonitorRepository;
use QueueMonitor\Support\MonitorRecorder;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobFailed;

class QueueMonitorServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/queue-monitor.php', 'queue-monitor');

        $this->app->singleton(QueueMonitorRepository::class, function ($app) {
            $driver = config('queue-monitor.driver', 'database');

            if (!in_array($driver, ['redis', 'database'], true)) {
                throw new \InvalidArgumentException(
                    "Unsupported queue monitor driver: {$driver}. Use 'database' or 'redis'."
                );
            }

            return match ($driver) {
                'redis' => new RedisQueueMonitorRepository(),
                'database' => new DatabaseQueueMonitorRepository(),
            };
        });

        $this->app->singleton(MonitorRecorder::class, function ($app) {
            return new MonitorRecorder($app->make(QueueMonitorRepository::class));
        });

        $this->app->singleton(\QueueMonitor\Services\QueueControlService::class);
    }

    public function boot(): void
    {
        // Force HTTPS URLs if configured or if request is HTTPS
        if (config('queue-monitor.ui.force_https') ||
            (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')) {
            URL::forceScheme('https');
        }

        $this->publishes([
            __DIR__ . '/../config/queue-monitor.php' => config_path('queue-monitor.php'),
        ], 'queue-monitor-config');

        $this->publishes([
            __DIR__ . '/../database/migrations/' => database_path('migrations'),
        ], 'queue-monitor-migrations');

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/queue-monitor'),
        ], 'queue-monitor-views');

        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'queue-monitor');
        $this->loadRoutesFrom(__DIR__ . '/../routes/web.php');

        if ($this->app->runningInConsole()) {
            $this->commands([
                PruneCommand::class,
                \QueueMonitor\Console\InstallCommand::class,
            ]);
        }

        $this->registerQueueEventListeners();
    }

    private function registerQueueEventListeners(): void
    {
        Event::listen(JobProcessing::class, function (JobProcessing $event): void {
            app(MonitorRecorder::class)->recordProcessing($event);
        });

        Event::listen(JobProcessed::class, function (JobProcessed $event): void {
            app(MonitorRecorder::class)->recordProcessed($event);
        });

        Event::listen(JobFailed::class, function (JobFailed $event): void {
            app(MonitorRecorder::class)->recordFailed($event);
        });
    }
}

