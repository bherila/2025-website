# BWH PHP — Claude Instructions

See `.github/copilot-instructions.md` for the full architecture overview, conventions, and patterns.

## Validation Requirements

**IMPORTANT**: All validations MUST pass before committing code:

### PHP Validations
- **PHP Linter**: Laravel Pint is configured — run `./vendor/bin/pint --test` to check, `./vendor/bin/pint` to fix
- **PHPUnit Tests**: Run `vendor/bin/phpunit --configuration phpunit.xml` — all tests must pass
  - **Important**: Run `pnpm run build` before PHPUnit so the Vite manifest exists for blade view tests
  - SQLite in-memory DB is configured automatically via `phpunit.xml` and `tests/bootstrap.php` — no extra setup needed
  - Do NOT use `$this->withoutVite()` in tests; the real manifest should be present during testing

### Frontend Validations
- **TypeScript Type Check**: Run `pnpm run type-check` — no TypeScript errors
- **ESLint**: Run `pnpm run lint` — no linting errors
- **Jest Tests**: Run `pnpm run test` — all tests must pass

### When to Run Validations
- Before every commit
- After making any code changes
- When addressing PR comments
- Before marking work as complete

### Fixing Pre-existing Issues
If you encounter pre-existing validation failures unrelated to your changes:
- Fix them if they're simple and in files you're modifying
- Otherwise, note them separately but don't let them block your PR
