<?php

namespace App\Providers;

use App\Listeners\UpdateLastLoginDate;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Auth\Events\Login;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Spatie\Csp\AddCspHeaders;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoTransportFactory;
use Symfony\Component\Mailer\Transport\Dsn;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Configure Vite to use the same CSP nonce as Spatie's laravel-csp
        if (config('csp.nonce_enabled', true)) {
            Vite::useCspNonce(app('csp-nonce'));
        }

        // Register a safe JSON-encode helper for client-portal hydration <script> blocks.
        // JSON_HEX_TAG prevents </script> breakout; the other HEX flags close the
        // remaining XSS vectors via HTML attribute/entity injection.
        Blade::directive('portalJson', function (string $expression): string {
            return "<?php echo json_encode($expression, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>";
        });

        // Register login event listener
        Event::listen(Login::class, UpdateLastLoginDate::class);

        // Admin gate - check if user has admin role
        Gate::define('admin', function ($user) {
            return $user->hasRole('admin');
        });

        // Alias for backward compatibility (uppercase)
        Gate::define('Admin', function ($user) {
            return $user->hasRole('admin');
        });

        // Gate for Vantage queue monitor dashboard - admin only
        Gate::define('viewVantage', function ($user) {
            return $user->hasRole('admin');
        });

        // Gate for accessing client company resources
        // User must be a member of the client company OR be an admin
        Gate::define('ClientCompanyMember', function ($user, $clientCompanyId) {
            // Admin users have access
            if ($user->hasRole('admin')) {
                return true;
            }

            // Check if user is a member of the client company
            $company = ClientCompany::find($clientCompanyId);
            if (! $company) {
                return false;
            }

            return $company->users()->where('user_id', $user->id)->exists();
        });

        // Register Spatie CSP middleware globally so CSP headers are added
        $kernel = $this->app->make(Kernel::class);
        $kernel->pushMiddleware(AddCspHeaders::class);

        // Register the Brevo (Symfony bridge) mail transport so MAIL_MAILER=brevo works
        $this->app['mail.manager']->extend('brevo', function ($config) {
            $configuration = $this->app->make('config');

            return (new BrevoTransportFactory)->create(
                Dsn::fromString($configuration->get('services.brevo.dsn'))
            );
        });
    }
}
