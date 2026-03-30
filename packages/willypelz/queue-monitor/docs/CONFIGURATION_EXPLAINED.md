# Configuration Clarification: QUEUE_CONNECTION vs QUEUE_MONITOR_DRIVER

## Understanding the Difference

### QUEUE_CONNECTION (Laravel Standard)
**Purpose:** Determines which connection your **queue jobs** use  
**Set by:** Laravel configuration  
**Values:** `sync`, `database`, `redis`, `sqs`, `beanstalkd`, etc.  
**Controls:** Where your jobs are queued and processed

```env
# .env
QUEUE_CONNECTION=redis  # Jobs use Redis queue
```

### QUEUE_MONITOR_DRIVER (Queue Monitor Specific)
**Purpose:** Determines where **monitoring data** is stored  
**Set by:** Queue Monitor configuration  
**Values:** `database` or `redis`  
**Controls:** Where job monitoring metadata is saved

```env
# .env (optional override)
QUEUE_MONITOR_DRIVER=redis  # Monitoring data uses Redis
```

---

## Smart Auto-Detection (No Configuration Needed!)

**Queue Monitor now automatically detects your queue connection:**

```php
// config/queue-monitor.php
'driver' => env('QUEUE_MONITOR_DRIVER', env('QUEUE_CONNECTION') === 'redis' ? 'redis' : 'database'),
```

### How It Works

| Your QUEUE_CONNECTION | Automatic Monitor Driver | Why? |
|----------------------|-------------------------|------|
| `redis` | `redis` | Both queue and monitoring use Redis (optimal!) |
| `database` | `database` | Both use database (consistent) |
| `sync` | `database` | Sync doesn't need monitoring, defaults to database |
| `sqs` | `database` | SQS in cloud, monitoring in local database |

---

## Common Scenarios

### Scenario 1: Redis for Everything (Most Common)

```env
# .env
QUEUE_CONNECTION=redis
```

**Result:**
- ✅ Jobs use Redis
- ✅ Monitoring uses Redis (automatic!)
- ✅ Zero configuration needed

### Scenario 2: Database for Everything

```env
# .env
QUEUE_CONNECTION=database
```

**Result:**
- ✅ Jobs use database
- ✅ Monitoring uses database (automatic!)
- ✅ Zero configuration needed

### Scenario 3: Different Storage for Monitoring

```env
# .env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database  # Override: use database for monitoring
```

**Result:**
- Jobs use Redis (fast queue processing)
- Monitoring uses database (persistent storage, SQL queries)

**Use case:** You want fast Redis queues but need permanent monitoring records for compliance.

### Scenario 4: SQS Queue with Local Monitoring

```env
# .env
QUEUE_CONNECTION=sqs
# QUEUE_MONITOR_DRIVER not set
```

**Result:**
- Jobs use AWS SQS (cloud queue)
- Monitoring uses database (automatic - defaults to database for non-Redis queues)

---

## When to Override QUEUE_MONITOR_DRIVER

### Don't Override (Default Behavior - Recommended)

✅ **When to use defaults:**
- Using Redis for queues → monitoring uses Redis automatically
- Using database for queues → monitoring uses database automatically
- Want simple, zero-config setup
- Queue and monitoring should use same storage

### Do Override

✅ **When to override:**

**Example 1: Fast Queues, Permanent Monitoring**
```env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database  # Keep permanent records
```

**Example 2: Database Queues, Redis Monitoring**
```env
QUEUE_CONNECTION=database
QUEUE_MONITOR_DRIVER=redis  # Faster monitoring dashboard
```

**Example 3: Cloud Queues, Local Monitoring**
```env
QUEUE_CONNECTION=sqs  # or 'beanstalkd'
QUEUE_MONITOR_DRIVER=database  # Monitor locally
```

---

## Configuration Examples

### Automatic (Recommended - 90% of cases)

```env
# .env - Just set your queue connection
QUEUE_CONNECTION=redis
```

**Queue Monitor automatically:**
- Detects you're using Redis
- Uses Redis for monitoring
- Uses same connection
- Zero extra config! ✅

### Manual Override (Advanced)

```env
# .env - Explicitly set different storage
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database
QUEUE_MONITOR_REDIS_CONNECTION=cache  # If needed
```

---

## Visual Diagram

### Default Behavior (Auto-Detect)

```
┌─────────────────────┐
│  QUEUE_CONNECTION   │
│     = redis         │
└──────────┬──────────┘
           │
           │ Auto-detects
           ▼
┌─────────────────────┐
│ QUEUE_MONITOR_DRIVER│
│     = redis         │ ← Automatically set!
└─────────────────────┘
```

### Override Behavior

```
┌─────────────────────┐
│  QUEUE_CONNECTION   │
│     = redis         │
└─────────────────────┘
           
┌─────────────────────┐
│QUEUE_MONITOR_DRIVER │
│    = database       │ ← Explicitly overridden
└─────────────────────┘
```

---

## Consolidation Summary

### Before (Confusing)
```env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=redis  # Duplicate! Why set both?
```

### After (Smart!)
```env
QUEUE_CONNECTION=redis
# That's it! Monitoring uses Redis automatically
```

**Optional override only when needed:**
```env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database  # Only if you want different storage
```

---

## FAQ

### Q: Do I need to set QUEUE_MONITOR_DRIVER?

**A:** No! In 90% of cases, just set `QUEUE_CONNECTION` and monitoring follows automatically.

### Q: What if I don't set QUEUE_CONNECTION?

**A:** It defaults to Laravel's default (usually `sync`), and monitoring uses `database`.

### Q: Can I use Redis monitoring with database queues?

**A:** Yes! Set:
```env
QUEUE_CONNECTION=database
QUEUE_MONITOR_DRIVER=redis
```

### Q: Is QUEUE_MONITOR_DRIVER duplicate?

**A:** No - it's an **optional override**. By default it auto-detects from `QUEUE_CONNECTION`, but you can override if you want different storage for monitoring.

### Q: What's the recommended setup?

**A:** Just set `QUEUE_CONNECTION` and let Queue Monitor auto-detect! This is optimal for 90% of use cases.

---

## Best Practices

### ✅ Recommended Approach

```env
# .env
QUEUE_CONNECTION=redis
# Done! Let Queue Monitor auto-detect
```

**Benefits:**
- Simple configuration
- Consistent storage
- Optimal performance
- Less configuration to manage

### ⚠️ Advanced Approach (When Needed)

```env
# .env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database  # Override for specific reason
```

**Use when:**
- Need permanent monitoring records (database)
- Want faster monitoring than queue processing
- Compliance requires SQL storage
- Different performance requirements

---

## Migration from Previous Versions

### If You Had This (v1.1.x)

```env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=redis
```

### Now You Can Simply Have (v1.2.0+)

```env
QUEUE_CONNECTION=redis
# QUEUE_MONITOR_DRIVER removed - auto-detected!
```

**Result:** Same behavior, less configuration! ✅

---

## Summary

### Key Points

1. **QUEUE_CONNECTION** = Where your jobs run (Laravel standard)
2. **QUEUE_MONITOR_DRIVER** = Where monitoring is stored (optional override)
3. **Auto-Detection** = Monitor driver follows queue connection by default
4. **Override Only When Needed** = 90% of users don't need to set QUEUE_MONITOR_DRIVER

### The Bottom Line

**For most users:**
```env
QUEUE_CONNECTION=redis
```
**That's all you need!** Queue Monitor figures out the rest. ✅

**For advanced users:**
```env
QUEUE_CONNECTION=redis
QUEUE_MONITOR_DRIVER=database  # Override when you have a specific reason
```

---

**They're not duplicates - one auto-follows the other, with optional override for advanced cases!**

