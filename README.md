# BWH PHP Project

## Deployment Instructions

These instructions are for deploying to a cPanel-hosted Apache server with the document root set to `~/public_html`.

### Prerequisites
- PHP 8.1 or higher
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
