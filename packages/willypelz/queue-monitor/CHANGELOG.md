# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **NEW**: Redis driver support for high-performance queue monitoring
- Configurable storage driver: choose between 'database' or 'redis'
- RedisQueueMonitorRepository with optimized key-value storage
- Automatic TTL-based expiration for Redis data
- Support for custom Redis connections
- Comprehensive Redis driver documentation
- Redis repository test suite
- **Smart auto-detection**: Automatically uses Redis when `QUEUE_CONNECTION=redis`
- **Automatic driver detection**: Monitor storage follows queue connection by default

### Changed
- **IMPROVED**: Driver now auto-detects from `QUEUE_CONNECTION` for zero-config setup
- Default driver intelligently switches based on your queue connection
- `QUEUE_MONITOR_DRIVER` is now optional - only needed for override scenarios
- Redis driver is used when `QUEUE_CONNECTION=redis`, database otherwise
- Service provider now dynamically binds repository based on driver configuration
- Configuration file includes driver selection and Redis options
- Redis connection defaults to using `QUEUE_CONNECTION` environment variable for seamless integration

### Migration Guide
- **No action needed** for most users - driver auto-detects from `QUEUE_CONNECTION`!
- If `QUEUE_CONNECTION=redis`, monitoring uses Redis automatically
- If `QUEUE_CONNECTION=database`, monitoring uses database automatically
- Only set `QUEUE_MONITOR_DRIVER` if you want different storage than your queue
- See [CONFIGURATION_EXPLAINED.md](docs/CONFIGURATION_EXPLAINED.md) for details

### Planned Features
- Webhooks for queue events
- Email/Slack notifications for failures
- Advanced filtering in dashboard
- Job replay functionality
- Real-time websocket updates
- Queue comparison charts
- Custom metric definitions

## [1.1.1] - 2026-03-18

### Fixed
- **CRITICAL**: Fixed mixed-content blocking issue when package is installed in HTTPS applications
- **CRITICAL**: Fixed API endpoints generating HTTP URLs causing blocked:mixed-content errors
- All CDN resources now use HTTPS URLs by default to prevent browser security warnings
- Added Content-Security-Policy meta tag to automatically upgrade insecure requests
- Added automatic HTTPS detection for servers behind proxies/load balancers (X-Forwarded-Proto support)
- Added Axios interceptor as client-side failsafe to convert HTTP to HTTPS

### Added
- Configurable CDN URLs in `queue-monitor.ui.cdn` config option
- `force_https` configuration option to force HTTPS URLs for API endpoints
- Support for custom CDN sources (useful for internal networks, regional CDNs, or self-hosted assets)
- Automatic URL protocol detection and correction in service provider
- Comprehensive security documentation covering HTTPS, CSP, and access control
- Mixed-content troubleshooting guide with API endpoint fixes
- Upgrade guide for smooth transition to v1.1.1

### Changed
- Dashboard view now loads CDN resources from configuration instead of hardcoded URLs
- Config file now includes CDN configuration section with HTTPS defaults
- Service provider now automatically detects HTTPS and forces secure URLs when needed
- API endpoint URLs now respect current protocol and force_https configuration

## [1.1.0] - 2026-02-24

### Added
- Laravel 12 support
- PHPUnit 11 support
- PHP 8.4 compatibility

### Changed
- Updated all Illuminate dependencies to support Laravel 10, 11, and 12
- Updated Orchestra Testbench to `^8.0|^9.0|^10.0`
- Updated PHPUnit to `^10.0|^11.0`
- Migrated test annotations from doc-comments to PHPUnit attributes
- Updated PHPUnit configuration to version 11.5 schema
- Improved test setup with `defineDatabaseMigrations()` method

### Fixed
- Test migration loading in Laravel 12
- PHPUnit deprecation warnings

## [1.0.0] - 2026-02-24

### Added
- Initial release
- Real-time queue monitoring dashboard
- Database driver support
- Job tracking (processing, processed, failed)
- Runtime metrics and statistics
- Queue control operations:
  - Pause/Resume queues
  - Throttle rate limiting
  - Retry failed jobs
- Queue control middleware
- RESTful API endpoints
- Automatic job event listeners
- Configurable data retention
- Prune command for cleanup
- Install command for easy setup
- Metrics aggregation for performance
- Comprehensive documentation
- PHPUnit test suite
- Vue.js 3 dashboard UI
- Indexed database tables for performance
- Multi-queue support
- Multi-connection support

### Security
- Configurable middleware protection
- CSRF token support
- Role-based access control compatible

## Version Support

| Version | Laravel | PHP    | Status       |
|---------|---------|--------|--------------|
| 1.2.x   | 10-12   | ^8.1   | In Development |
| 1.1.x   | 10-12   | ^8.1   | Active       |
| 1.0.x   | 10-11   | ^8.1   | Maintenance  |

## Upgrade Guide

### From 1.0 to 1.1

1. **Update PHP version**: Ensure your application runs PHP 8.2 or higher
2. **Update dependencies**: Run `composer update willypelz/queue-monitor`
3. **Run tests**: Test your application thoroughly with the new version
4. **Update test annotations** (if you have custom tests): Replace `/** @test */` with `#[Test]` attribute

See [LARAVEL_12_UPGRADE.md](LARAVEL_12_UPGRADE.md) for detailed upgrade information.

### From 0.x to 1.0

This is the initial release. No upgrade path needed.

## Support

For issues, please visit: [GitHub Issues](https://github.com/willypelz/queue-monitor/issues)

For questions, please visit: [GitHub Discussions](https://github.com/willypelz/queue-monitor/discussions)

