# Queue Monitor - Project Summary

## Overview

Queue Monitor is a comprehensive Laravel package for monitoring and controlling queue operations with full database driver support. It provides a modern dashboard, RESTful API, and operational controls that surpass Laravel Horizon's capabilities while remaining lightweight and easy to install.

## Project Structure

```
queue-monitor/
├── .github/
│   └── workflows/
│       └── tests.yml              # CI/CD pipeline
├── config/
│   └── queue-monitor.php          # Package configuration
├── database/
│   └── migrations/
│       ├── *_create_queue_monitor_jobs_table.php
│       ├── *_create_queue_monitor_controls_table.php
│       └── *_create_queue_monitor_metrics_table.php
├── docs/
│   ├── installation.md            # Installation guide
│   ├── controls.md                # Queue controls documentation
│   ├── api.md                     # API reference
│   ├── middleware.md              # Middleware setup
│   └── advanced.md                # Advanced features
├── examples/
│   └── QueueMonitorExamples.php   # Usage examples
├── resources/
│   └── views/
│       └── dashboard.blade.php    # Vue.js dashboard
├── routes/
│   └── web.php                    # Package routes
├── src/
│   ├── Console/
│   │   ├── InstallCommand.php     # Installation command
│   │   └── PruneCommand.php       # Cleanup command
│   ├── Contracts/
│   │   └── QueueMonitorRepository.php
│   ├── Http/
│   │   └── Controllers/
│   │       ├── DashboardController.php
│   │       └── QueueControlController.php
│   ├── Jobs/
│   │   └── AggregateMetrics.php   # Metrics aggregation
│   ├── Middleware/
│   │   └── QueueControlMiddleware.php
│   ├── Models/
│   │   ├── QueueMonitorControl.php
│   │   └── QueueMonitorJob.php
│   ├── Repositories/
│   │   └── DatabaseQueueMonitorRepository.php
│   ├── Services/
│   │   └── QueueControlService.php
│   ├── Support/
│   │   └── MonitorRecorder.php
│   └── QueueMonitorServiceProvider.php
├── tests/
│   ├── Feature/
│   │   └── MonitorRecorderTest.php
│   └── TestCase.php
├── .gitignore
├── CHANGELOG.md
├── composer.json
├── CONTRIBUTING.md
├── LICENSE
├── phpunit.xml
└── readme.md
```

## Core Components

### 1. Service Provider
- **QueueMonitorServiceProvider**: Registers services, publishes assets, and sets up event listeners

### 2. Data Layer
- **QueueMonitorJob Model**: Tracks individual job executions
- **QueueMonitorControl Model**: Stores control states (pause, throttle)
- **DatabaseQueueMonitorRepository**: Implements data access patterns

### 3. Event Monitoring
- **MonitorRecorder**: Listens to Laravel queue events and records job lifecycle
- Captures: JobProcessing, JobProcessed, JobFailed events

### 4. Queue Controls
- **QueueControlService**: Implements pause, resume, throttle operations
- **QueueControlMiddleware**: Enforces controls on job execution

### 5. Web Interface
- **DashboardController**: Serves the UI and stats API
- **QueueControlController**: Handles control operations
- **Vue.js Dashboard**: Real-time monitoring interface with Tailwind CSS

### 6. Commands
- **InstallCommand**: One-command installation
- **PruneCommand**: Data retention management

### 7. Jobs
- **AggregateMetrics**: Performance-optimized metrics summarization

## Key Features

### Monitoring
✅ Real-time job tracking
✅ Runtime metrics (min, max, avg)
✅ Success/failure rates
✅ Connection and queue filtering
✅ Historical data retention

### Controls
✅ Pause/Resume queues
✅ Throttle rate limiting (jobs/minute)
✅ Retry failed jobs
✅ Per-queue, per-connection granularity

### Performance
✅ Indexed database queries
✅ Metrics aggregation
✅ Configurable data pruning
✅ Efficient event listeners

### Developer Experience
✅ One-command installation
✅ Auto-discovery service provider
✅ RESTful API
✅ Comprehensive documentation
✅ Example code included

## Database Schema

### queue_monitor_jobs
- Tracks all job executions
- Indexed on: job_id, connection, queue, status, timestamps
- Stores: payload, runtime, exception details

### queue_monitor_controls
- Stores control states
- Unique constraint on: connection, queue, type
- Types: pause, throttle, scale

### queue_monitor_metrics
- Aggregated statistics
- Indexed on: connection, queue, period, period_type
- Supports: hourly, daily aggregations

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/stats` | GET | Dashboard statistics |
| `/jobs` | GET | Recent job list |
| `/control/pause` | POST | Pause queue |
| `/control/resume` | POST | Resume queue |
| `/control/throttle` | POST | Set rate limit |
| `/control/retry` | POST | Retry failed jobs |

## Configuration Options

- `path`: Dashboard URL path
- `middleware`: Access control
- `retention_days`: Data retention period
- `ui.refresh_seconds`: Dashboard refresh rate
- `control.pause_release_seconds`: Pause behavior
- `control.throttle_default_rate_per_minute`: Default throttle
- `control.throttle_release_seconds`: Throttle behavior

## Installation Steps

1. `composer require queue-monitor/queue-monitor`
2. `php artisan queue-monitor:install`
3. Visit `/queue-monitor`

## Testing

- PHPUnit configuration included
- Test coverage for core features
- Orchestra Testbench for package testing
- CI/CD via GitHub Actions

## Comparison with Alternatives

### vs Laravel Horizon
- ✅ Database driver support (Horizon: Redis only)
- ✅ Lightweight installation
- ✅ More control options
- ✅ Simpler architecture

### vs romanzipp/laravel-queue-monitor
- ✅ Built-in controls (pause, throttle)
- ✅ Advanced metrics aggregation
- ✅ Modern Vue 3 UI
- ✅ RESTful API
- ✅ Better performance optimization

## Future Roadmap

- [ ] Webhooks for events
- [ ] Email/Slack notifications
- [ ] WebSocket real-time updates
- [ ] Advanced filtering/search
- [ ] Job replay functionality
- [ ] Custom metric definitions
- [ ] Multi-language support
- [ ] Docker examples

## Deployment Considerations

### Production Checklist
- ✅ Configure authentication middleware
- ✅ Set up automatic pruning
- ✅ Enable metrics aggregation
- ✅ Cache routes and config
- ✅ Monitor disk space for job data

### Performance Tips
- Use metrics aggregation for high-volume queues
- Configure appropriate retention periods
- Index custom queries if extending
- Consider read replicas for analytics

## Support Matrix

| Laravel | PHP | Status |
|---------|-----|--------|
| 11.x | 8.2-8.3 | ✅ Supported |
| 10.x | 8.1-8.3 | ✅ Supported |

## License

MIT License - Free for commercial and personal use

## Maintainers

Queue Monitor Team

---

**Built with ❤️ for the Laravel community**

