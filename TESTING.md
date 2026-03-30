# Testing Guide

**IMPORTANT**: All validations below MUST pass before committing code.

## Frontend

Run these first — all are mandatory:

1. **TypeScript**: `pnpm run type-check` — must pass with no errors
2. **ESLint**: `pnpm run lint` — must pass with no errors
3. **Jest**: `pnpm run test` — all tests must pass

## Backend

Before running backend tests, build the Vite manifest: `pnpm run build` (required for blade view tests).

All PHP tests run against an **in-memory SQLite database** for speed and safety — no risk to local or production MySQL.

1. **Laravel Pint** (PHP linter): `./vendor/bin/pint --test` to check, `./vendor/bin/pint` to fix
   - This is mandatory for every change, including minor fixes and refactors.
2. **PHP Type Annotations**: All PHP methods and functions MUST have explicit return type annotations.
3. **PHPUnit**: `composer test` — all tests must pass
   - SQLite in-memory is auto-configured via `phpunit.xml` + `tests/bootstrap.php`
   - Do NOT use `$this->withoutVite()`; the real manifest should exist during testing


### Database Safety
The project uses a custom `SafeTestCase` class (located in `tests/SafeTestCase.php`) that enforces the use of SQLite in-memory. If a test attempts to run against a non-SQLite connection, it will throw a `RuntimeException`.

Every test class that extends `Tests\TestCase` automatically verifies the database connection in `setUp()`. If tests accidentally try to use MySQL, they will fail immediately.

### Environment Configuration
The testing environment is configured in `phpunit.xml`, `.env.testing`, and `tests/bootstrap.php`. Critical settings include:
- `DB_CONNECTION=sqlite`
- `DB_DATABASE=:memory:`
- `APP_ENV=testing`

The `tests/bootstrap.php` file force-sets `DB_CONNECTION=sqlite` and `DB_DATABASE=:memory:` (plus clears other `DB_*` vars) via `putenv()` **before** the autoloader runs. This ensures tests always use SQLite in-memory regardless of shell-exported environment variables.

## Writing Tests

### Feature Tests (with Database)
Feature tests use the database and should use `RefreshDatabase` trait:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_something(): void
    {
        $admin = $this->createAdminUser();
        $response = $this->actingAs($admin)->get('/admin/dashboard');
        $response->assertStatus(200);
    }
}
```

### Unit Tests (no Database)
Unit tests should not need the database. They test individual classes in isolation:

```php
<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class MyUnitTest extends TestCase
{
    public function test_logic(): void
    {
        $this->assertTrue(true);
    }
}
```

**Note**: Unit tests extend `PHPUnit\Framework\TestCase` directly, not `Tests\TestCase`.

### TestCase Helper Methods
The base `TestCase` class provides helper methods:
- `$this->createAdminUser($attributes)` - Creates an admin user.
- `$this->createUser($attributes)` - Creates a regular user.

## Schema Management

When you add new migrations to production:
1. Run migrations on MySQL: `php artisan migrate`
2. Dump the new schema: `php artisan schema:dump`
3. Update `database/schema/sqlite-schema.sql` with equivalent SQLite syntax if needed.

## Troubleshooting

### "SAFETY ERROR: Tests must use SQLite database"
Check that `phpunit.xml` has `DB_CONNECTION=sqlite` and you're not overriding it in your shell environment.

### "Table not found" errors
The SQLite schema might be out of sync. Check `database/schema/sqlite-schema.sql` includes the table.
