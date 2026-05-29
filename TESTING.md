# Testing Guide

**IMPORTANT**: All validations below MUST pass before committing code. None of these
are optional — PHPStan in particular is easy to forget because other checks may still
pass while static-analysis errors stay uncaught.

## Pre-Commit Checklist

Run every command below. Every one must return a clean result before any commit or push:

| # | Layer | Command | Must produce |
|---|---|---|---|
| 1 | TS   | `pnpm run type-check` | No errors |
| 2 | JS   | `pnpm run lint` | No errors |
| 3 | JS   | `pnpm run test` | All tests pass |
| 4 | PHP  | `./vendor/bin/pint --test --format agent` | `{"result":"pass"}` |
| 5 | PHP  | `vendor/bin/phpstan analyse --no-progress` | `[OK] No errors` |
| 6 | PHP  | `composer test` (or `php artisan test --compact`) | All tests pass |

Steps 1–3 are fast; run them first. Step 5 (PHPStan) is the step most likely to fail
silently if skipped — always run it even when your change looks "PHP-trivial".

## Frontend (steps 1–3)

1. **TypeScript**: `pnpm run type-check` — must pass with no errors
2. **ESLint**: `pnpm run lint` — must pass with no errors
3. **Jest**: `pnpm run test` — all tests must pass

## Optional Playwright Checks

Playwright checks are available for ad-hoc browser verification. They are not part of the mandatory pre-commit checklist and should not be treated as required on every PR.

### Finance Lot Reconciliation

The finance reconciliation E2E spec uses a file-backed SQLite database so the seeder, Laravel server, and browser share state.

```bash
cp .env.example .env
printf '\nAPP_ENV=testing\nAPP_URL=http://127.0.0.1:8000\nDB_CONNECTION=sqlite\nDB_DATABASE=%s/database/database.sqlite\nSESSION_DRIVER=file\n' "$PWD" >> .env
touch database/database.sqlite
php artisan key:generate --no-interaction --force
php artisan migrate --database=sqlite --no-interaction
php artisan finance:seed-recon-drift-fixture --quiet-json > tests/e2e/.fixture-state.json
php artisan serve --host=127.0.0.1 --port=8000
```

In another terminal:

```bash
pnpm exec playwright install chromium
pnpm run test:e2e:finance-lot-reconciliation
```

Run a single assertion loop with `pnpm exec playwright test tests/e2e/finance-lot-reconciliation.spec.ts -g "account override"`. The scheduled/manual workflow is **E2E Tests**.

### Parking Pickup

Run them locally when changing Parking Pickup rendering, camera framing, mobile layout, or other browser-visible game behavior:

```bash
pnpm exec playwright install chromium
PLAYWRIGHT_BASE_URL=http://localhost:8000 pnpm run test:e2e:parking-pickup
```

The local command assumes the app is already running on `localhost:8000`. Override `PLAYWRIGHT_BASE_URL` for another local port or deployed preview URL.

For CI, use the manual GitHub Actions workflow:

1. Open **Actions**.
2. Select **Parking Pickup Playwright**.
3. Click **Run workflow**.
4. Choose the branch to verify.
5. Leave `base_url` blank to build the branch and serve it locally on the runner, or set `base_url` to test a deployed preview.

The workflow is `workflow_dispatch` only. It uploads the Playwright report, screenshots, traces, and local Laravel server log as artifacts. See `docs/games/parking-pickup-playwright.md` for details.

## Backend (steps 4–6)

Before running backend tests, build the Vite manifest: `pnpm run build` (required for blade view tests).

All PHP tests run against an **in-memory SQLite database** for speed and safety — no risk to local or production MySQL.

4. **Laravel Pint** (PHP linter): `./vendor/bin/pint --test --format agent` to check, `./vendor/bin/pint --format agent` to fix.
   - Mandatory for every PHP change, including minor fixes and refactors.
5. **PHPStan** (static analysis): `vendor/bin/phpstan analyse --no-progress` — must report `[OK] No errors`.
   - Runs at level 5 with the Larastan Laravel extension.
   - Pre-existing errors are captured in `phpstan-baseline.neon`; new code must not introduce new errors.
   - Common failure pattern to check before committing: calling a `Schema::*` / builder / fluent helper with its arguments in the wrong order — PHPStan flags the type mismatch where Pint and PHPUnit stay silent.
   - Never suppress with `@phpstan-ignore`, baseline entries, inline `@var` tags, `assert()`, or defensive casts. Fix the underlying type.
   - To regenerate the baseline after fixing old errors: `vendor/bin/phpstan analyse --generate-baseline=phpstan-baseline.neon`.
6. **PHP Type Annotations**: All PHP methods and functions MUST have explicit return type annotations.
7. **PHPUnit**: `composer test` — all tests must pass.
   - SQLite in-memory is auto-configured via `phpunit.xml` + `tests/bootstrap.php`.
   - Do NOT use `$this->withoutVite()`; the real manifest should exist during testing.


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

**NEVER run migrations or schema dumps unless the user explicitly requests it.**

When the user explicitly asks to run migrations or update the schema dump:
1. Run migrations against SQLite only: `php artisan migrate --database=sqlite --no-interaction`
2. Dump the schema against SQLite only: `php artisan schema:dump --database=sqlite` (**NEVER** use `--prune`)

Always pass `--database=sqlite` explicitly — the `.env` may point to a staging/production MySQL host, and omitting this flag risks running against real data.

## Troubleshooting

### "SAFETY ERROR: Tests must use SQLite database"
Check that `phpunit.xml` has `DB_CONNECTION=sqlite` and you're not overriding it in your shell environment.

### "Table not found" errors
The SQLite schema might be out of sync. Check `database/schema/sqlite-schema.sql` includes the table.
