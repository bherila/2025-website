# Testing Guide

This document describes the testing setup for the BWH PHP project.

## Overview

The project uses **PHPUnit** for PHP tests and **Jest** for TypeScript/React tests. All PHP tests run against an **in-memory SQLite database** to ensure they never accidentally touch MySQL databases (which may contain production data).

## Quick Start

```bash
# Run all PHP tests
composer test

# Run PHP tests directly with PHPUnit
./vendor/bin/phpunit

# Run specific test file
./vendor/bin/phpunit tests/Feature/UserRolesFeatureTest.php

# Run specific test method
./vendor/bin/phpunit --filter test_can_generate_invoice_for_period

# Run TypeScript/React tests
npm test
```

## Database Safety

### Why SQLite for Tests?

The `.env` file typically contains MySQL credentials that may point to development or even production databases. Running tests with `RefreshDatabase` trait against MySQL could **delete all data** in those databases.

To prevent this, our test setup:

1. **Forces SQLite**: `phpunit.xml` sets `DB_CONNECTION=sqlite` and `DB_DATABASE=:memory:`
2. **Safety Check**: `TestCase.php` verifies SQLite is being used in `setUp()`
3. **Schema Dump**: `database/schema/sqlite-schema.sql` provides the schema for RefreshDatabase

### How It Works

When you run tests:

1. `tests/bootstrap.php` forces `DB_CONNECTION=sqlite` and `DB_DATABASE=:memory:` before Laravel loads
2. `.env.testing` provides additional testing environment configuration
3. When `RefreshDatabase` trait is used, Laravel loads `database/schema/sqlite-schema.sql`
4. The test runs against a fresh, empty in-memory database
5. Database is destroyed when test completes

### Safety Verification

Every test class that extends `Tests\TestCase` automatically verifies the database connection:

```php
protected function setUp(): void
{
    parent::setUp();
    $this->assertDatabaseIsSqlite(); // Fails if not SQLite
}
```

If tests accidentally try to use MySQL, they will fail immediately with:

```
SAFETY ERROR: Tests must use SQLite database, not 'mysql'.
```

## Test Structure

```
tests/
├── TestCase.php           # Base test class with safety checks
├── CreatesApplication.php # Laravel application bootstrap trait
├── Feature/               # Integration/feature tests
│   ├── ClientManagement/  # Domain-specific feature tests
│   │   ├── ClientInvoiceTest.php
│   │   └── DelayedBillingTest.php
│   ├── ExampleTest.php
│   ├── MasterPasswordLoginTest.php
│   └── UserRolesFeatureTest.php
└── Unit/                  # Unit tests (no database)
    ├── ClientPortalMonthlyBalancesTest.php
    ├── ExampleTest.php
    └── UserRolesTest.php
```

## Writing Tests

### Feature Tests (with Database)

Feature tests use the database and should use `RefreshDatabase`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_something(): void
    {
        // Create test data
        $user = User::factory()->create(['user_role' => 'admin']);

        // Or use the helper methods
        $admin = $this->createAdminUser();
        $regularUser = $this->createUser();

        // Make requests
        $response = $this->actingAs($admin)
            ->get('/admin/dashboard');

        $response->assertStatus(200);
    }
}
```

### Unit Tests (no Database)

Unit tests should not need the database. They test individual classes in isolation:

```php
<?php

namespace Tests\Unit;

use App\Models\User;
use PHPUnit\Framework\TestCase;

class UserRolesTest extends TestCase
{
    public function test_get_roles_returns_array(): void
    {
        $user = new User;
        $user->user_role = 'admin,user';

        $roles = $user->getRoles();

        $this->assertIsArray($roles);
        $this->assertCount(2, $roles);
    }
}
```

**Note**: Unit tests extend `PHPUnit\Framework\TestCase` directly, not `Tests\TestCase`, so they don't have the SQLite safety check (they don't need it since they don't use the database).

### Testing API Endpoints

```php
public function test_api_requires_authentication(): void
{
    $response = $this->getJson('/api/some-endpoint');
    $response->assertStatus(401);
}

public function test_api_returns_data(): void
{
    $user = $this->createAdminUser();

    $response = $this->actingAs($user)
        ->getJson('/api/some-endpoint');

    $response->assertStatus(200)
        ->assertJsonStructure(['data' => ['id', 'name']]);
}
```

### Testing with Factories

The project includes a `UserFactory`. Create additional factories in `database/factories/`:

```php
// Create a single model
$user = User::factory()->create();

// Create with specific attributes
$admin = User::factory()->create(['user_role' => 'admin']);

// Create multiple
$users = User::factory()->count(5)->create();

// Create without persisting
$user = User::factory()->make();
```

## TestCase Helper Methods

The base `TestCase` class provides helper methods:

```php
// Create an admin user
$admin = $this->createAdminUser();
$admin = $this->createAdminUser(['name' => 'Custom Admin']);

// Create a regular user
$user = $this->createUser();
$user = $this->createUser(['email' => 'custom@example.com']);
```

## Schema Management

### Key Files

- `tests/bootstrap.php` - Forces SQLite before Laravel loads (critical safety)
- `.env.testing` - Testing environment configuration
- `database/schema/sqlite-schema.sql` - SQLite-compatible schema for RefreshDatabase
- `database/schema/mysql-schema.sql` - Production MySQL schema dump

### Updating the Schema

When you add new migrations to production:

1. Run migrations on MySQL: `php artisan migrate`
2. Dump the new schema: `php artisan schema:dump`
3. Update `sqlite-schema.sql` with equivalent SQLite syntax

**SQLite Conversion Notes:**

| MySQL | SQLite |
|-------|--------|
| `bigint unsigned AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `varchar(N)`, `text`, `mediumtext`, `longtext` | `TEXT` |
| `decimal(M,N)`, `double`, `float` | `REAL` |
| `tinyint(1)` | `INTEGER` |
| `datetime`, `timestamp`, `date` | `TEXT` |
| `enum('a','b')` | `TEXT` |
| `current_timestamp()` | `CURRENT_TIMESTAMP` |
| `ENGINE=InnoDB` | Remove |
| `CHARSET=utf8mb4` | Remove |
| `UNIQUE KEY name (cols)` | `UNIQUE (cols)` or `CREATE UNIQUE INDEX` |

## Troubleshooting

### "SAFETY ERROR: Tests must use SQLite database"

This means the tests detected a non-SQLite database. Check:

1. `phpunit.xml` has `DB_CONNECTION=sqlite` and `DB_DATABASE=:memory:`
2. You're not overriding these in `.env.testing`
3. You haven't modified the database config in tests

### "Table not found" errors

The SQLite schema might be out of sync with your models:

1. Check `database/schema/sqlite-schema.sql` includes the table
2. Ensure the table definition matches what your model expects

### Tests are slow

Using in-memory SQLite should be fast. If tests are slow:

1. Ensure you're using `RefreshDatabase`, not `DatabaseMigrations`
2. Check for unnecessary API calls or external services
3. Consider mocking heavy operations

### Foreign key constraint errors

SQLite handles foreign keys differently. The schema includes:

```sql
PRAGMA foreign_keys = OFF;
-- ... table creation ...
PRAGMA foreign_keys = ON;
```

If you have constraint issues in tests, you may need to create related records first.

## Running Tests in CI

The test setup is CI-ready. Example GitHub Actions workflow:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
      - name: Install dependencies
        run: composer install --no-interaction
      - name: Run tests
        run: composer test
```

No MySQL setup needed in CI since tests use SQLite.
