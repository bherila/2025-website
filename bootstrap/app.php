<?php

use App\Http\Middleware\DbQueryCountMiddleware;
use App\Http\Middleware\PreventRequestForgeryAllowingBearer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
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
        // DbQueryCountMiddleware is a dev-only tool.  We use getenv() here
        // because app()->environment() is not yet available when withMiddleware
        // callbacks are resolved.  This ensures zero prod overhead — the class
        // is never loaded, instantiated, or called outside local.
        if (getenv('APP_ENV') === 'local') {
            $middleware->append(DbQueryCountMiddleware::class);
        }

        // Let routes in the session-based `web` group also accept stateless
        // bearer-token (MCP API Key) clients: the subclass skips CSRF only when
        // an Authorization: Bearer token is present, leaving cookie/session
        // requests fully CSRF-protected. See PreventRequestForgeryAllowingBearer.
        $middleware->replaceInGroup('web', PreventRequestForgery::class, PreventRequestForgeryAllowingBearer::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);
    })->create();
