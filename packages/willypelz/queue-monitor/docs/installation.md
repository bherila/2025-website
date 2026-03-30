# Installation Guide

## Quick Start

### 1. Install via Composer

```bash
composer require willypelz/queue-monitor
```

### 2. Run Installation Command

```bash
php artisan queue-monitor:install
```

This command will:
- Publish configuration file to `config/queue-monitor.php`
- Publish migrations
- Run migrations automatically

### 3. Access the Dashboard

Visit `http://your-app.test/queue-monitor` to view the dashboard.

---

## Manual Installation

If you prefer to install manually:

### 1. Install Package

```bash
composer require willypelz/queue-monitor
```

### 2. Publish Config

```bash
php artisan vendor:publish --tag=queue-monitor-config
```

### 3. Publish Migrations

```bash
php artisan vendor:publish --tag=queue-monitor-migrations
```

### 4. Run Migrations

```bash
php artisan migrate
```

### 5. (Optional) Publish Views

If you want to customize the dashboard UI:

```bash
php artisan vendor:publish --tag=queue-monitor-views
```

---

## Configuration

Edit `config/queue-monitor.php` to customize:

```php
return [
    // Dashboard URL path
    'path' => 'queue-monitor',

    // Add authentication middleware
    'middleware' => ['web', 'auth'],

    // Data retention in days
    'retention_days' => 14,

    // UI refresh interval
    'ui' => [
        'refresh_seconds' => 10,
    ],

    // Control settings
    'control' => [
        'pause_release_seconds' => 10,
        'throttle_default_rate_per_minute' => 60,
        'throttle_release_seconds' => 5,
    ],
];
```

---

## Securing the Dashboard

### Option 1: Basic Authentication

```php
'middleware' => ['web', 'auth'],
```

### Option 2: Role-Based Access

```php
'middleware' => ['web', 'auth', 'can:view-queue-monitor'],
```

Then define the gate in `AuthServiceProvider`:

```php
Gate::define('view-queue-monitor', function ($user) {
    return in_array($user->email, [
        'admin@example.com',
    ]);
});
```

### Option 3: Custom Middleware

Create a middleware:

```bash
php artisan make:middleware QueueMonitorAccess
```

```php
public function handle($request, Closure $next)
{
    if (! auth()->user()->isAdmin()) {
        abort(403);
    }

    return $next($request);
}
```

Register and use it:

```php
'middleware' => ['web', 'queue-monitor-access'],
```

---

## Scheduled Tasks

Add to `app/Console/Kernel.php` for automatic cleanup:

```php
protected function schedule(Schedule $schedule)
{
    // Prune old job records daily
    $schedule->command('queue-monitor:prune')->daily();
    
    // Optional: Aggregate metrics every hour for better performance
    $schedule->job(new \QueueMonitor\Jobs\AggregateMetrics)->hourly();
}
```

---

## Environment-Specific Installation

### Production

```bash
composer require willypelz/queue-monitor --optimize-autoloader --no-dev
php artisan queue-monitor:install
php artisan config:cache
php artisan route:cache
```

### Development

```bash
composer require willypelz/queue-monitor
php artisan queue-monitor:install
```

---

## Troubleshooting

### Dashboard shows 404

1. Clear route cache: `php artisan route:clear`
2. Check `config/queue-monitor.php` path setting
3. Verify middleware allows access

### Jobs not appearing

1. Verify migrations ran: `php artisan migrate:status`
2. Check queue worker is running: `php artisan queue:work`
3. Ensure jobs are dispatched properly

### Permission errors

1. Check file permissions: `chmod -R 775 storage bootstrap/cache`
2. Verify database connection in `.env`
3. Run: `php artisan config:clear`

### Mixed-content blocking (HTTPS applications)

**Fixed in latest version!** The dashboard now includes automatic protection against mixed-content errors.

If you're still experiencing issues:

1. Ensure you have the latest version: `composer update willypelz/queue-monitor`
2. Clear your browser cache
3. Verify all CDN URLs in `config/queue-monitor.php` use HTTPS
4. Check the dashboard view includes: `<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">`

For more details, see [Security Considerations](./security.md).

---

## Next Steps

- [Using Queue Controls](./controls.md)
- [Middleware Setup](./middleware.md)
- [API Documentation](./api.md)

