<?php

use App\Http\Middleware\DbQueryCountMiddleware;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Http\Middleware\RequireFeaturePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Facades\Route;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            // Agent API: stateless bearer-token surface. Deliberately NOT in
            // the `web` middleware group (no session, no CSRF); JSON/TOON
            // content negotiation applies to the whole group.
            Route::prefix('api/agent/v1')
                ->name('agent.')
                ->middleware([NegotiatesAgentPayload::class])
                ->group(__DIR__.'/../routes/agent.php');
        },
    )
    ->withCommands([
        __DIR__.'/../app/GenAiProcessor/Console/Commands',
    ])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'feature' => RequireFeaturePermission::class,
        ]);

        // DbQueryCountMiddleware is a dev-only tool.  We use getenv() here
        // because app()->environment() is not yet available when withMiddleware
        // callbacks are resolved.  This ensures zero prod overhead — the class
        // is never loaded, instantiated, or called outside local.
        if (getenv('APP_ENV') === 'local') {
            $middleware->append(DbQueryCountMiddleware::class);
        }
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
    })->create();
