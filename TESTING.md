# Testing Guide

**IMPORTANT**: All validations MUST pass before committing code:

## Frontend

Run frontend tests first:

- **TypeScript Type Check**: `pnpm run type-check`, there MUST be no TypeScript errors
- **ESLint**: `pnpm run lint`, there MUST be no linting errors
- **Jest Tests**: `pnpm run test`, all tests MUST pass

## Backend

Before running any backend tests, you MUST run `pnpm run build` to build Vite manifest and js files for blade view tests.

- All PHP tests run against an **in-memory SQLite database**. This ensures speed and safety, preventing any accidental modifications to your local or production MySQL database.
- **PHP Linter**: Laravel Pint is configured — run `./vendor/bin/pint --test` to check, `./vendor/bin/pint` to fix
- **PHPUnit Tests**: Run `composer test` — all tests must pass
  - SQLite in-memory DB is configured automatically via `phpunit.xml` and `tests/bootstrap.php` — no extra setup needed
  - Do NOT use `$this->withoutVite()` in tests; the real manifest should be present during testing


### Database Safety
The project uses a custom `SafeTestCase` class (located in `tests/SafeTestCase.php`) that enforces the use of SQLite in-memory. If a test attempts to run against a non-SQLite connection, it will throw a `RuntimeException`.

### Environment Configuration
The testing environment is configured in `phpunit.xml` and `.env.testing`. Critical settings include:
- `DB_CONNECTION=sqlite`
- `DB_DATABASE=:memory:`
- `APP_ENV=testing`

**Note:** If you have `DB_CONNECTION` set in your shell environment, it may override these settings. You should unset them before running tests:
```bash
unset DB_CONNECTION DB_DATABASE DB_HOST DB_PORT DB_USERNAME DB_PASSWORD
composer test
```
