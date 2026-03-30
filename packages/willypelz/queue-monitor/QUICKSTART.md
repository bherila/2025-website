# Quick Start Guide

Get up and running with Queue Monitor in 5 minutes!

## Step 1: Install (1 minute)

```bash
composer require willypelz/queue-monitor
php artisan queue-monitor:install
```

## Step 2: Access Dashboard (30 seconds)

Visit: `http://your-app.test/queue-monitor`

You should see:
- ✅ Stats cards (Total, Processed, Failed, Processing, Avg Runtime)
- ✅ Queue controls panel
- ✅ Recent jobs table

## Step 3: Dispatch a Test Job (2 minutes)

Create a test job:

```bash
php artisan make:job TestQueueMonitor
```

Add to `app/Jobs/TestQueueMonitor.php`:

```php
<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class TestQueueMonitor implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        sleep(2); // Simulate work
        logger('TestQueueMonitor executed!');
    }
}
```

Dispatch it in `tinker`:

```bash
php artisan tinker
>>> dispatch(new App\Jobs\TestQueueMonitor);
```

Run the queue worker:

```bash
php artisan queue:work
```

## Step 4: View in Dashboard (30 seconds)

Refresh `/queue-monitor` and you should see:
- Total jobs: 1
- Processed: 1
- Your job in the recent jobs table
- Runtime: ~2000ms

## Step 5: Try Controls (1 minute)

### Pause Queue

In the dashboard:
1. Connection: `database`
2. Queue: `default`
3. Click "Pause"

Dispatch another job:
```bash
php artisan tinker
>>> dispatch(new App\Jobs\TestQueueMonitor);
```

Notice the worker won't process it (it's paused!).

Click "Resume" to unpause.

### Throttle Queue

1. Connection: `database`
2. Queue: `default`
3. Rate: `5`
4. Click "Throttle (jobs/min)"

Now jobs will be limited to 5 per minute.

## Next Steps

### Secure the Dashboard

Edit `config/queue-monitor.php`:

```php
'middleware' => ['web', 'auth'],
```

### Enable Automatic Cleanup

Add to `app/Console/Kernel.php`:

```php
protected function schedule(Schedule $schedule)
{
    $schedule->command('queue-monitor:prune')->daily();
}
```

### Use Control Middleware

Add to your jobs:

```php
use QueueMonitor\Middleware\QueueControlMiddleware;

public function middleware(): array
{
    return [new QueueControlMiddleware()];
}
```

### Explore the API

```bash
curl http://your-app.test/queue-monitor/api/stats
```

## Troubleshooting

### Dashboard shows 404
```bash
php artisan route:clear
php artisan config:clear
```

### Jobs not appearing
```bash
php artisan migrate:status  # Verify migrations ran
php artisan queue:work      # Start worker if not running
```

### No stats showing
Dispatch a few test jobs first!

## Learn More

- [Full Documentation](docs/installation.md)
- [API Reference](docs/api.md)
- [Queue Controls](docs/controls.md)
- [Advanced Features](docs/advanced.md)

---

**That's it! You're monitoring your queues like a pro! 🚀**

