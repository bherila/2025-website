# Advanced Features

## Performance Optimization

### 1. Metrics Aggregation

For high-volume queues, enable metrics aggregation to reduce database load:

```php
// In app/Console/Kernel.php
protected function schedule(Schedule $schedule)
{
    $schedule->job(new \QueueMonitor\Jobs\AggregateMetrics)->hourly();
}
```

This creates hourly and daily summaries, allowing you to query aggregated data instead of raw job records.

### 2. Database Indexing

The package includes optimized indexes for common queries:
- `job_id` - For quick job lookups
- `connection`, `queue`, `status` - For filtering
- `created_at`, `started_at` - For time-based queries

### 3. Query Optimization

Use chunking for large datasets:

```php
use QueueMonitor\Models\QueueMonitorJob;

QueueMonitorJob::where('status', 'failed')
    ->chunk(100, function ($jobs) {
        foreach ($jobs as $job) {
            // Process job
        }
    });
```

---

## Custom Event Listeners

Extend the monitoring with custom event listeners:

```php
use Illuminate\Support\Facades\Event;
use QueueMonitor\Models\QueueMonitorJob;

// Listen for job status changes
Event::listen('eloquent.updated: ' . QueueMonitorJob::class, function ($job) {
    if ($job->status === 'failed') {
        // Send alert notification
        \Illuminate\Support\Facades\Log::critical('Job failed', [
            'job' => $job->name,
            'exception' => $job->exception,
        ]);
    }
});
```

---

## Alerting System

Create a simple alerting system for queue issues:

```php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Mail;
use QueueMonitor\Contracts\QueueMonitorRepository;

class QueueAlertService
{
    public function __construct(private QueueMonitorRepository $repository)
    {
    }

    public function checkAndAlert(): void
    {
        $stats = $this->repository->dashboardStats(60);
        
        // Alert if failure rate is high
        if ($stats['total'] > 0) {
            $failureRate = ($stats['failed'] / $stats['total']) * 100;
            
            if ($failureRate > 10) {
                $this->sendAlert("High failure rate: {$failureRate}%", $stats);
            }
        }
        
        // Alert if jobs are stuck processing
        if ($stats['processing'] > 100) {
            $this->sendAlert("Many jobs stuck processing: {$stats['processing']}", $stats);
        }
    }

    private function sendAlert(string $message, array $stats): void
    {
        Mail::to('admin@example.com')
            ->send(new \App\Mail\QueueAlert($message, $stats));
    }
}
```

Schedule the alerts:

```php
protected function schedule(Schedule $schedule)
{
    $schedule->call(function () {
        app(\App\Services\QueueAlertService::class)->checkAndAlert();
    })->everyFiveMinutes();
}
```

---

## Multi-Tenant Support

For multi-tenant applications, filter by tenant:

```php
use QueueMonitor\Models\QueueMonitorJob;

// Add tenant_id to job payload
class ProcessTenantData implements ShouldQueue
{
    public function __construct(public int $tenantId)
    {
    }
}

// Filter jobs by tenant
$tenantJobs = QueueMonitorJob::whereJsonContains('payload->data->tenantId', $tenantId)
    ->get();
```

---

## Export Functionality

Export job data for analysis:

```php
use QueueMonitor\Models\QueueMonitorJob;
use Illuminate\Support\Facades\Storage;

class ExportQueueData
{
    public function exportToCsv(string $filename = 'queue-jobs.csv'): string
    {
        $jobs = QueueMonitorJob::orderBy('created_at', 'desc')
            ->limit(10000)
            ->get();

        $csv = "ID,Name,Queue,Status,Runtime,Started At,Finished At\n";
        
        foreach ($jobs as $job) {
            $csv .= implode(',', [
                $job->id,
                $job->name,
                $job->queue,
                $job->status,
                $job->runtime_ms ?? 'N/A',
                $job->started_at ?? 'N/A',
                $job->finished_at ?? 'N/A',
            ]) . "\n";
        }

        Storage::put($filename, $csv);
        return storage_path("app/{$filename}");
    }
}
```

---

## Queue Scaling

Integrate with worker scaling based on queue depth:

```php
use QueueMonitor\Contracts\QueueMonitorRepository;

class QueueScaler
{
    public function scaleWorkers(): void
    {
        $stats = app(QueueMonitorRepository::class)->dashboardStats(5);
        
        // Scale up if many jobs processing
        if ($stats['processing'] > 50) {
            $this->scaleUp();
        }
        
        // Scale down if idle
        if ($stats['processing'] < 5) {
            $this->scaleDown();
        }
    }

    private function scaleUp(): void
    {
        // Start additional workers
        // Implementation depends on your infrastructure
        // e.g., Kubernetes, AWS ECS, Laravel Vapor, etc.
    }

    private function scaleDown(): void
    {
        // Reduce worker count
    }
}
```

---

## Custom Dashboard Views

Extend the dashboard with custom views:

```php
// In your routes file
Route::get('/custom-queue-monitor', function () {
    $stats = app(\QueueMonitor\Contracts\QueueMonitorRepository::class)
        ->dashboardStats(1440); // Last 24 hours

    return view('custom.queue-dashboard', compact('stats'));
});
```

---

## Integration with Monitoring Services

### New Relic

```php
if (extension_loaded('newrelic')) {
    newrelic_custom_metric('Queue/Processed', $stats['processed']);
    newrelic_custom_metric('Queue/Failed', $stats['failed']);
}
```

### Datadog

```php
use DataDog\DogStatsd;

$statsd = new DogStatsd();
$statsd->gauge('queue.processed', $stats['processed']);
$statsd->gauge('queue.failed', $stats['failed']);
```

### Sentry

```php
if ($stats['failed'] > 0) {
    \Sentry\captureMessage('Queue failures detected', [
        'level' => 'warning',
        'extra' => $stats,
    ]);
}
```

---

## Backup and Recovery

Backup job data before pruning:

```php
use Illuminate\Support\Facades\DB;

class BackupQueueData
{
    public function backup(): void
    {
        $oldJobs = DB::table('queue_monitor_jobs')
            ->where('created_at', '<', now()->subDays(14))
            ->get();

        Storage::disk('s3')->put(
            'queue-backups/' . now()->format('Y-m-d') . '.json',
            $oldJobs->toJson()
        );
    }
}
```

Schedule before pruning:

```php
protected function schedule(Schedule $schedule)
{
    $schedule->call(function () {
        app(\App\Services\BackupQueueData::class)->backup();
    })->daily();
    
    $schedule->command('queue-monitor:prune')->daily()->after(function () {
        // Backup completed
    });
}
```

---

## Testing

Test your queue monitoring integration:

```php
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class QueueMonitoringTest extends TestCase
{
    /** @test */
    public function it_records_dispatched_jobs()
    {
        Queue::fake();
        
        dispatch(new \App\Jobs\ProcessOrder(123));
        
        Queue::assertPushed(\App\Jobs\ProcessOrder::class);
    }

    /** @test */
    public function it_tracks_job_failures()
    {
        $this->expectException(\Exception::class);
        
        dispatch(new \App\Jobs\FailingJob());
        
        $this->artisan('queue:work --once');
        
        $this->assertDatabaseHas('queue_monitor_jobs', [
            'status' => 'failed',
        ]);
    }
}
```

