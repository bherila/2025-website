# Quick Start - Redis Driver

Get started with Redis-powered queue monitoring in 5 minutes!

## Prerequisites

- Laravel 10+, PHP 8.2+
- Redis installed and running
- Laravel Redis configured

## Step-by-Step Setup

### 1. Install Package

```bash
composer require willypelz/queue-monitor
```

### 2. Configure Redis Driver

**If you're already using Redis for queues** (i.e., `QUEUE_CONNECTION=redis` in `.env`):

✅ **No configuration needed!** Queue Monitor will automatically use Redis.

**If you want to explicitly set it or use different connection:**

Add to your `.env`:

```env
QUEUE_MONITOR_DRIVER=redis  # Optional: Redis is now default
QUEUE_MONITOR_REDIS_CONNECTION=default  # Optional: uses QUEUE_CONNECTION by default
```

### 3. Install (Skip Migrations!)

Since you're using Redis, you don't need database migrations:

```bash
php artisan vendor:publish --tag=queue-monitor-config
php artisan vendor:publish --tag=queue-monitor-views  # Optional
```

**Note:** Skip `php artisan migrate` - Redis doesn't use database tables!

### 4. Verify Redis Connection

```bash
php artisan tinker
```

```php
Redis::ping(); // Should return "+PONG"
config('queue-monitor.driver'); // Should return "redis"
```

### 5. Test It Out

Dispatch a test job:

```php
// app/Jobs/TestJob.php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class TestJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        logger('Test job executed!');
        sleep(2); // Simulate work
    }
}
```

Dispatch it:

```bash
php artisan tinker
```

```php
\App\Jobs\TestJob::dispatch();
```

Start queue worker:

```bash
php artisan queue:work
```

### 6. View Dashboard

Visit: `http://your-app.test/queue-monitor`

You should see:
- ✅ Your test job in the recent jobs list
- ✅ Stats showing 1 processed job
- ✅ Runtime metrics

## Verify Redis Data

Check what's stored in Redis:

```bash
redis-cli
```

```redis
# List all queue monitor keys
KEYS queue_monitor:*

# View stats
HGETALL queue_monitor:stats

# View job index
ZRANGE queue_monitor:index 0 -1

# View a specific job (use key from KEYS command)
HGETALL queue_monitor:jobs:redis:default:1234567890
```

Example output:

```
127.0.0.1:6379> HGETALL queue_monitor:stats
1) "total"
2) "1"
3) "processed"
4) "1"
5) "failed"
6) "0"
7) "processing"
8) "0"
```

## Configuration Options

### Basic Configuration

```php
// config/queue-monitor.php
return [
    'driver' => 'redis',
    'retention_days' => 14, // Jobs expire after 14 days
    'redis' => [
        'connection' => 'default',
    ],
];
```

### Custom Redis Connection

```php
// config/database.php
'redis' => [
    'monitor' => [
        'host' => env('REDIS_MONITOR_HOST', '127.0.0.1'),
        'port' => env('REDIS_MONITOR_PORT', 6379),
        'database' => 1, // Separate database
    ],
],

// config/queue-monitor.php
'redis' => [
    'connection' => 'monitor',
],
```

### Environment Variables

```env
# Driver selection (Redis is now default!)
QUEUE_MONITOR_DRIVER=redis  # Optional

# Redis connection (uses QUEUE_CONNECTION by default)
QUEUE_MONITOR_REDIS_CONNECTION=default  # Optional

# Laravel queue connection
QUEUE_CONNECTION=redis  # Queue Monitor will use this automatically!

# Custom Redis host (if using custom connection)
REDIS_MONITOR_HOST=127.0.0.1
REDIS_MONITOR_PORT=6379
REDIS_MONITOR_DB=1
```

## Common Tasks

### Switch from Database to Redis

```bash
# 1. Update .env
echo "QUEUE_MONITOR_DRIVER=redis" >> .env

# 2. Clear config cache
php artisan config:clear

# 3. Done! New jobs will use Redis
```

### Clear All Monitoring Data

```bash
php artisan tinker
```

```php
app(\QueueMonitor\Repositories\RedisQueueMonitorRepository::class)->clear();
```

Or via Redis CLI:

```bash
redis-cli
DEL queue_monitor:*
```

### Reset Stats Only

```php
app(\QueueMonitor\Repositories\RedisQueueMonitorRepository::class)->resetStats();
```

### Schedule Automatic Cleanup

```php
// app/Console/Kernel.php
protected function schedule(Schedule $schedule)
{
    $schedule->command('queue-monitor:prune')->daily();
}
```

## Troubleshooting

### Dashboard Shows No Data

**Check driver:**
```bash
php artisan tinker
config('queue-monitor.driver'); // Must be 'redis'
```

**Check Redis connection:**
```bash
redis-cli ping
# Should return: PONG
```

**Check Redis has data:**
```bash
redis-cli
KEYS queue_monitor:*
```

### Connection Refused

**Ensure Redis is running:**
```bash
# Check Redis status
redis-cli ping

# If not running, start it
# Ubuntu/Debian:
sudo systemctl start redis

# macOS:
brew services start redis
```

**Check `.env` configuration:**
```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
```

### Jobs Not Appearing

**Verify queue worker is running:**
```bash
php artisan queue:work --verbose
```

**Check job was dispatched:**
```bash
php artisan tinker
\App\Jobs\TestJob::dispatch();
exit

php artisan queue:work
```

### Performance Issues

**Check Redis memory:**
```bash
redis-cli INFO memory
```

**Reduce retention period:**
```php
'retention_days' => 7, // Instead of 14
```

## Next Steps

- [Full Redis Driver Documentation](./redis-driver.md)
- [Performance Optimization](./advanced.md)
- [Security Best Practices](./security.md)
- [API Documentation](./api.md)

## Comparison: Database vs Redis

| Feature | Database | Redis |
|---------|----------|-------|
| **Speed** | ~10ms/job | ~0.5ms/job |
| **Throughput** | 200 jobs/sec | 5000+ jobs/sec |
| **Storage** | Disk (persistent) | Memory (TTL) |
| **Queries** | Full SQL | Key-value only |
| **Best For** | Low-medium volume | High volume |

## Example: High-Volume Setup

For processing 1000+ jobs/minute:

```env
# .env
QUEUE_MONITOR_DRIVER=redis
QUEUE_MONITOR_REDIS_CONNECTION=monitor
REDIS_MONITOR_HOST=redis-server.internal
REDIS_MONITOR_DB=1
```

```php
// config/queue-monitor.php
'driver' => 'redis',
'retention_days' => 7, // Shorter retention for high volume
'redis' => [
    'connection' => 'monitor',
],
'ui' => [
    'refresh_seconds' => 5, // Faster updates
],
```

## Success!

You're now monitoring queues with Redis - **20x faster** than database! 🚀

Need help? Check the [full documentation](./redis-driver.md) or [open an issue](https://github.com/willypelz/queue-monitor/issues).

