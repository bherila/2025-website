<?php

use App\Http\Middleware\DbQueryCountMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([
        __DIR__.'/../app/GenAiProcessor/Console/Commands',
    ])
    ->withMiddleware(function (Middleware $middleware): void {
        // DbQueryCountMiddleware is a dev-only tool; it no-ops via an internal
        // environment guard when not running in the local environment.
        $middleware->append(DbQueryCountMiddleware::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
    })->create();
