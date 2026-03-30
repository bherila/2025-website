# Migration Guide: Database to Redis

Complete guide for migrating from Database to Redis driver.

## Overview

**Good News:** Starting with v1.2.0, Queue Monitor defaults to Redis driver! If you're already using `QUEUE_CONNECTION=redis`, you might not need to migrate at all - it will use Redis automatically.

This guide helps you:

## Pre-Migration Checklist

- [ ] Redis installed and running
- [ ] Laravel configured for Redis
- [ ] Backup existing monitoring data (if needed)
- [ ] Review Redis memory requirements
- [ ] Understand data retention implications

---

## Migration Steps

### Step 1: Verify Prerequisites

**Check Redis is running:**
```bash
redis-cli ping
# Expected: PONG
```

**Check Laravel Redis config:**
```bash
php artisan tinker
```

```php
Redis::ping(); // Should return "+PONG"
config('database.redis.default'); // Should show Redis config
exit
```

### Step 2: Backup Current Data (Optional)

If you need to preserve historical data:

```bash
# Export database data
php artisan tinker
```

```php
$jobs = \QueueMonitor\Models\QueueMonitorJob::all();
$jobs->toJson(JSON_PRETTY_PRINT) | file_put_contents('queue_monitor_backup.json', $jobs);
exit
```

### Step 3: Configure Redis Driver

**Update `.env`:**
```env
QUEUE_MONITOR_DRIVER=redis
QUEUE_MONITOR_REDIS_CONNECTION=default
```

**Or publish and edit config:**
```bash
php artisan vendor:publish --tag=queue-monitor-config
```

```php
// config/queue-monitor.php
'driver' => 'redis',
'redis' => [
    'connection' => 'default',
],
```

### Step 4: Clear Caches

```bash
php artisan config:clear
php artisan cache:clear
```

### Step 5: Verify the Switch

```bash
php artisan tinker
```

```php
// Check driver is Redis
config('queue-monitor.driver'); // Should return 'redis'

// Test Redis repository
$repo = app(\QueueMonitor\Contracts\QueueMonitorRepository::class);
get_class($repo); // Should be RedisQueueMonitorRepository
exit
```

### Step 6: Test with a Job

```bash
php artisan tinker
```

```php
// Dispatch a test job
\App\Jobs\YourTestJob::dispatch();
exit

# Run queue worker
php artisan queue:work --once

# Check Redis has the data
redis-cli
```

```redis
KEYS queue_monitor:*
HGETALL queue_monitor:stats
```

### Step 7: Monitor Dashboard

Visit: `http://your-app.test/queue-monitor`

Verify:
- ✅ Dashboard loads
- ✅ Stats show data
- ✅ Recent jobs display
- ✅ Controls work

---

## What Happens to Database Data?

### During Migration

- ✅ **Old database data remains** in database tables
- ✅ **New jobs go to Redis** after switching
- ✅ **Dashboard shows Redis data** only
- ✅ **No automatic data migration**

### After Migration

**Option 1: Keep Both (Recommended)**

- Keep database tables for historical reference
- New data goes to Redis
- Can query old data in database if needed

**Option 2: Clean Up Database**

After verifying Redis works well:

```bash
# Optional: Drop old tables (after backup!)
php artisan tinker
```

```php
// ⚠️ WARNING: This deletes all database monitoring data!
Schema::dropIfExists('queue_monitor_jobs');
Schema::dropIfExists('queue_monitor_controls');
Schema::dropIfExists('queue_monitor_metrics');
```

---

## Rollback Plan

If you need to switch back to database:

### Quick Rollback

```bash
# 1. Update .env
sed -i 's/QUEUE_MONITOR_DRIVER=redis/QUEUE_MONITOR_DRIVER=database/' .env

# 2. Clear config
php artisan config:clear

# 3. Verify
php artisan tinker
```

```php
config('queue-monitor.driver'); // Should be 'database'
```

### Preserve Redis Data

If you want to keep Redis data before rolling back:

```bash
redis-cli
```

```redis
# Export Redis data
SAVE

# Or backup specific keys
KEYS queue_monitor:* > redis_backup.txt
```

---

## Parallel Operation (Advanced)

Run both drivers temporarily for comparison:

### Setup

**Database Instance:**
```env
# server1 .env
QUEUE_MONITOR_DRIVER=database
```

**Redis Instance:**
```env
# server2 .env
QUEUE_MONITOR_DRIVER=redis
```

### Compare

Monitor both dashboards:
- Database: `http://server1.test/queue-monitor`
- Redis: `http://server2.test/queue-monitor`

Compare:
- Speed
- Data consistency
- Resource usage

### Gradual Migration

1. Week 1: Test Redis on staging
2. Week 2: Run Redis on 1 production server
3. Week 3: Migrate 50% of servers
4. Week 4: Migrate remaining servers

---

## Performance Verification

### Before Migration (Database)

```bash
# Measure dashboard load time
time curl http://your-app.test/queue-monitor/api/stats
# Example: 0.050s (50ms)
```

### After Migration (Redis)

```bash
time curl http://your-app.test/queue-monitor/api/stats
# Example: 0.002s (2ms)
```

**Expected improvement: 20-30x faster!**

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test 100 requests
ab -n 100 -c 10 http://your-app.test/queue-monitor/api/stats
```

**Database:** ~200 requests/second  
**Redis:** ~5000+ requests/second

---

## Common Issues

### Issue: Dashboard shows no data after migration

**Cause:** Driver not actually switched

**Fix:**
```bash
php artisan config:clear
php artisan tinker
config('queue-monitor.driver') // Verify it's 'redis'
```

### Issue: Connection refused

**Cause:** Redis not running or wrong host

**Fix:**
```bash
# Check Redis
redis-cli ping

# Check .env
cat .env | grep REDIS
```

### Issue: Jobs not appearing

**Cause:** Queue worker not restarted

**Fix:**
```bash
# Restart workers
php artisan queue:restart
php artisan queue:work
```

### Issue: Old data still showing

**Cause:** Browser cache or dashboard cache

**Fix:**
```bash
# Clear all caches
php artisan cache:clear
php artisan config:clear
php artisan view:clear

# Hard refresh browser (Ctrl+Shift+R)
```

---

## Memory Planning

### Estimate Redis Memory Usage

**Formula:**
```
Memory = Jobs × Average_Job_Size × Retention_Days
```

**Example:**
- 10,000 jobs/day
- 2 KB per job
- 14 days retention

```
10,000 × 2KB × 14 = 280 MB
```

### Monitor Redis Memory

```bash
redis-cli INFO memory
```

```
used_memory_human:280M
used_memory_peak_human:300M
```

### Adjust Retention if Needed

```php
// config/queue-monitor.php
'retention_days' => 7, // Reduce from 14 to 7
```

---

## Production Deployment

### Deployment Checklist

- [ ] Test in staging environment first
- [ ] Backup database monitoring data
- [ ] Verify Redis has sufficient memory
- [ ] Configure Redis persistence (if needed)
- [ ] Update monitoring alerts
- [ ] Restart queue workers after deployment
- [ ] Monitor Redis memory usage
- [ ] Have rollback plan ready

### Deployment Script

```bash
#!/bin/bash
# deploy-redis-monitor.sh

echo "Deploying Redis Queue Monitor..."

# 1. Pull latest code
git pull origin main

# 2. Update .env
echo "QUEUE_MONITOR_DRIVER=redis" >> .env

# 3. Clear caches
php artisan config:clear
php artisan cache:clear

# 4. Restart workers
php artisan queue:restart

# 5. Verify
php artisan tinker --execute="echo config('queue-monitor.driver');"

echo "Deployment complete!"
```

### Rollback Script

```bash
#!/bin/bash
# rollback-redis-monitor.sh

echo "Rolling back to database driver..."

# 1. Update .env
sed -i 's/QUEUE_MONITOR_DRIVER=redis/QUEUE_MONITOR_DRIVER=database/' .env

# 2. Clear caches
php artisan config:clear

# 3. Restart workers
php artisan queue:restart

echo "Rollback complete!"
```

---

## Best Practices

### ✅ Do's

- ✅ Test thoroughly in staging first
- ✅ Monitor Redis memory usage
- ✅ Keep retention_days reasonable (7-14 days)
- ✅ Use dedicated Redis connection for monitoring
- ✅ Document the migration for your team
- ✅ Keep database tables for historical data

### ❌ Don'ts

- ❌ Don't migrate in production without testing
- ❌ Don't forget to restart queue workers
- ❌ Don't set very long retention periods with Redis
- ❌ Don't share Redis DB with other critical services
- ❌ Don't forget to clear config cache

---

## Success Criteria

Your migration is successful if:

- ✅ Dashboard loads faster (20x improvement)
- ✅ New jobs appear in dashboard
- ✅ Stats update correctly
- ✅ Queue controls work (pause/resume)
- ✅ Redis memory usage is stable
- ✅ No errors in logs

---

## Support

Need help with migration?

- [Redis Driver Documentation](./redis-driver.md)
- [Quick Start Guide](REDIS_QUICKSTART.md)
- [GitHub Issues](https://github.com/willypelz/queue-monitor/issues)
- [GitHub Discussions](https://github.com/willypelz/queue-monitor/discussions)

---

**Happy migrating! Your queue monitoring is about to get 20x faster! 🚀**

