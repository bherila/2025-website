# Queue Control Middleware

To enable pause and throttle controls on your jobs, add the middleware to your job class:

```php
<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use QueueMonitor\Middleware\QueueControlMiddleware;

class ProcessData implements ShouldQueue
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

## How It Works

The middleware checks before each job execution:

1. **Pause Check**: If the queue is paused, the job is released back to the queue
2. **Throttle Check**: If the queue is throttled, it enforces the rate limit

Jobs are automatically released with configurable delays when paused or throttled.

