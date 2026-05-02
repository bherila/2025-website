# BWH PHP Project

See [docs/README.md](docs/README.md) for the project documentation index.

## Features

### Finance Management
- **RSU Tracking**: Manage Restricted Stock Units with full CRUD interface
  - Track equity awards, vesting schedules, and stock valuations
  - View awards with chart visualizations (shares or value over time)
  - Bulk import from clipboard
  - Manage individual awards: add, edit, delete
  - See [docs/finance/rsu.md](docs/finance/rsu.md) for details
- **Account Management**: Track financial accounts and transactions
- **Statement Processing**: Import and process bank/brokerage statements (PDFs are parsed via Google Gemini AI with a two‑step preview UI; finance statement extraction now uses one structured `addFinanceAccount` tool call per account, and server results are cached by file hash to reduce API calls). Fund-level information is automatically excluded. Dates from PDFs are normalized to plain `YYYY-MM-DD` strings with no timezone.
- **Async GenAI Import Pipeline**: Queue-based AI document processing with direct-to-S3 uploads, daily quota management, and de-duplication. See [docs/genai-import.md](docs/genai-import.md) for details.
  - Configurable per-user daily quota in User Settings
  - Admin panel at `/admin/genai-jobs` for monitoring all jobs (raw Gemini request/response visible)
- **Position & Lot Tracking**: Track investment positions and lots (open/closed) with automatic Short-Term/Long-Term classification and realized gain/loss calculation. Includes a dedicated "Lots" dashboard.
- **Payslip Management**: Manage and track payslips

### Client Management
- **Company & User Management**: Track clients and assign users to companies.
- **Project & Task Tracking**: Manage deliverables per client.
- **Time Tracking**: Log hours with support for "h:mm" and decimal formats.
- **Billing & Invoicing**:
  - Automated monthly invoice generation.
  - Flexible rollover/carry-over hours system.
  - **Minimum Availability Rule**: Automatically bills "catch-up hours" if carried-forward debt reduces new month availability below 1 hour.
  - **Time Entry Splitting**: Automatically splits time entries that are only partially billed to ensure precise carry-over tracking.
- **File Management**: S3-integrated file uploads for agreements, tasks, and more.

## Local Development

When running locally (`APP_ENV=local` or `APP_URL` contains `localhost`):
- **Master Password**: You can log in as ANY user using the password `1234567890`.
- **Dev Login**: A "Dev Login" button appears on the login page for quick access (allows blank password).

## Testing

Run tests with:

```bash
composer test
```

Tests use an in-memory SQLite database to ensure they never accidentally touch MySQL databases. See [TESTING.md](TESTING.md) for detailed testing documentation.

### SQLite Version Requirement

Development and test environments require SQLite **3.35+** (for modern `ALTER TABLE ... DROP COLUMN` support used by migrations).

## Cron / Queue Configuration

The application uses Laravel's scheduler to process GenAI import jobs and other background tasks. Add the following cron entry to run the scheduler every minute:

```bash
* * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1
```

The scheduler automatically manages these GenAI queue commands (defined in `routes/console.php`):

| Command                       | Frequency       | Purpose                                                     |
|-------------------------------|-----------------|-------------------------------------------------------------|
| `genai:run-queue`             | Every minute    | Self-heals orphaned pending jobs, then processes the `genai-imports` queue (timeout: 300s, max 10 jobs) |
| `genai:process-scheduled`     | Every minute    | Promotes `queued_tomorrow` jobs whose scheduled date has arrived |
| `genai:requeue-stale`         | Every 5 minutes | Resets jobs stuck in `processing` for more than 10 minutes  |

All scheduled commands use `withoutOverlapping()` to prevent concurrent execution, so frequent cron invocations will not cause processes to pile up.

> **Note:** The database queue `retry_after` is set to 600 seconds (in `config/queue.php`) to accommodate GenAI jobs that may take up to 5 minutes to complete. Do not lower this below the `ParseImportJob` timeout of 300 seconds.

## Deployment Instructions

These instructions are for deploying to a cPanel-hosted Apache server with the document root set to `~/public_html`.

### Prerequisites
- PHP 8.3 or higher
- Composer
- Node.js 18+ and pnpm
- MySQL or compatible database (if using database features)
- SSH access to the server

### Steps

1. **Upload Project Files**
   - Upload all project files to your server, excluding `node_modules/`, `vendor/`, and `.env` (if it contains sensitive data).
   - Place the files in a directory outside of `public_html`, e.g., `~/laravel-app/`.

2. **Install PHP Dependencies**
   ```bash
   cd ~/laravel-app
   composer install --no-dev --optimize-autoloader
   ```

3. **Configure Environment**
   - Copy `.env.example` to `.env` if it exists, or create `.env` based on your local setup.
   - Update the following in `.env`:
     - `APP_KEY`: Generate with `php artisan key:generate`
     - Database credentials
     - `APP_URL`: Set to your domain
     - Other environment-specific settings

4. **Build Frontend Assets**
   ```bash
   cd ~/laravel-app
   pnpm install
   pnpm run build
   ```

5. **Set Up Public Directory**
   - Copy the contents of `~/laravel-app/public/` to `~/public_html/`.
   - Ensure `~/public_html/index.php` points to the correct Laravel application path.
   - Update `~/public_html/index.php` if necessary to reflect the new path:
     ```php
     require __DIR__.'/../laravel-app/vendor/autoload.php';
     $app = require_once __DIR__.'/../laravel-app/bootstrap/app.php';
     ```

6. **Database Setup** (if applicable)
   ```bash
   cd ~/laravel-app
   php artisan migrate --force
   php artisan db:seed  # if you have seeders
   ```

7. **Set Permissions**
   ```bash
   cd ~/laravel-app
   chown -R youruser:youruser storage bootstrap/cache
   chmod -R 775 storage bootstrap/cache
   ```

8. **Clear and Cache Configuration**
   ```bash
   cd ~/laravel-app
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```

9. **Test the Deployment**
   - Visit your domain to ensure the site loads correctly.
   - Check for any 500 errors and review logs in `storage/logs/`.

### Additional Notes
- If you need to update the application, repeat steps 1-8, or use a deployment script.
- For zero-downtime deployments, consider using a staging directory and switching symlinks.
- Ensure your server meets Laravel's requirements: https://laravel.com/docs/requirements
