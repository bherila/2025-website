<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Event;
use App\Models\ClientManagement\ClientCompany;
use App\Listeners\UpdateLastLoginDate;
use Illuminate\Auth\Events\Login;

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
        // Register login event listener
        Event::listen(Login::class, UpdateLastLoginDate::class);

        Gate::define('Admin', function ($user) {
            return $user->id === 1 || $user->user_role === 'Admin';
        });

        // Gate for accessing client company resources
        // User must be a member of the client company OR be the root user (id=1)
        Gate::define('ClientCompanyMember', function ($user, $clientCompanyId) {
            // Root user always has access
            if ($user->id === 1) {
                return true;
            }
            
            // Admin users have access
            if ($user->user_role === 'Admin') {
                return true;
            }
            
            // Check if user is a member of the client company
            $company = ClientCompany::find($clientCompanyId);
            if (!$company) {
                return false;
            }
            
            return $company->users()->where('user_id', $user->id)->exists();
        });
    }
}
