# Queue Controls Documentation

## Overview

Queue Monitor provides advanced operational controls for your Laravel queues, allowing you to pause, resume, throttle, and retry jobs directly from the dashboard or via API.

## Available Controls

### 1. Pause Queue

Temporarily stop processing jobs on a specific queue without stopping the worker.

**Via Dashboard:**
- Enter connection name (e.g., `database`)
- Enter queue name (e.g., `default`)
- Click "Pause" button

**Via API:**
```bash
curl -X POST http://your-app.test/queue-monitor/api/control/pause \
  -H "Content-Type: application/json" \
  -d '{"connection": "database", "queue": "default"}'
```

**Via Code:**
```php
use QueueMonitor\Services\QueueControlService;

$control = app(QueueControlService::class);
$control->pause('database', 'default');
```

### 2. Resume Queue

Resume a paused queue to continue processing jobs.

**Via Dashboard:**
- Enter connection and queue names
- Click "Resume" button

**Via API:**
```bash
curl -X POST http://your-app.test/queue-monitor/api/control/resume \
  -H "Content-Type: application/json" \
  -d '{"connection": "database", "queue": "default"}'
```

**Via Code:**
```php
$control->resume('database', 'default');
```

### 3. Throttle Queue

Limit the rate at which jobs are processed (jobs per minute).

**Via Dashboard:**
- Enter connection and queue names
- Enter rate (e.g., `60` for 60 jobs/minute)
- Click "Throttle" button

**Via API:**
```bash
curl -X POST http://your-app.test/queue-monitor/api/control/throttle \
  -H "Content-Type: application/json" \
  -d '{"connection": "database", "queue": "default", "rate": 30}'
```

**Via Code:**
```php
$control->throttle('database', 'default', 30); // 30 jobs per minute
```

### 4. Retry Failed Jobs

Retry all failed jobs on a specific queue.

**Via Dashboard:**
- Enter connection and queue names
- Click "Retry Failed" button

**Via API:**
```bash
curl -X POST http://your-app.test/queue-monitor/api/control/retry \
  -H "Content-Type: application/json" \
  -d '{"connection": "database", "queue": "default"}'
```

## Using Controls with Job Middleware

To enable pause and throttle controls on your jobs, add the middleware:

```php
<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use QueueMonitor\Middleware\QueueControlMiddleware;

class ProcessOrder implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function middleware(): array
    {
        return [new QueueControlMiddleware()];
    }

    public function handle(): void
    {
        // Your job logic here
    }
}
```

## Use Cases

### Rate Limiting External API Calls

```php
// Limit to 10 requests per minute to avoid API throttling
$control->throttle('database', 'api-requests', 10);
```

### Emergency Pause During Incidents

```php
// Pause email queue during email service outage
$control->pause('database', 'emails');

// Resume when service is restored
$control->resume('database', 'emails');
```

### Gradual Rollout

```php
// Start slow with new feature
$control->throttle('database', 'new-feature', 5);

// Increase rate after monitoring
$control->throttle('database', 'new-feature', 50);
```

### Retry Strategy

```php
// Retry failed jobs after fixing an issue
$control->retry('database', 'default');
```

## Checking Control Status

```php
use QueueMonitor\Services\QueueControlService;

$control = app(QueueControlService::class);

// Check if queue is paused
if ($control->isPaused('database', 'default')) {
    echo "Queue is paused";
}

// Get current throttle rate
$rate = $control->getThrottleRate('database', 'default');
if ($rate) {
    echo "Queue throttled to {$rate} jobs/minute";
}
```

## Configuration

Control behavior is configured in `config/queue-monitor.php`:

```php
'control' => [
    // Delay before releasing paused jobs back to queue
    'pause_release_seconds' => 10,
    
    // Default throttle rate if not specified
    'throttle_default_rate_per_minute' => 60,
    
    // Delay before releasing throttled jobs
    'throttle_release_seconds' => 5,
],
```

## Best Practices

1. **Always add middleware** to jobs that need control support
2. **Monitor metrics** after applying controls to verify expected behavior
3. **Use appropriate throttle rates** based on your system capacity
4. **Document control changes** for your team
5. **Test in staging** before applying controls in production

## Troubleshooting

### Controls not taking effect

- Ensure `QueueControlMiddleware` is added to your jobs
- Verify queue worker is running
- Check control status via API or code

### Jobs stuck after pause

- Use `resume()` to unpause the queue
- Check worker logs for errors
- Verify database connection

### Throttle not limiting as expected

- Check cache driver is working
- Verify rate is set correctly
- Monitor actual job processing rate

