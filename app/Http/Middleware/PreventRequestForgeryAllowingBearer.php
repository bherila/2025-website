<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Http\Request;

class PreventRequestForgeryAllowingBearer extends PreventRequestForgery
{
    /**
     * Skip CSRF verification for bearer-token (stateless API) requests.
     *
     * The framework CSRF guard exists to stop a third-party site from using a
     * victim's *cookie* session to forge a state-changing request. A request
     * authenticated with an `Authorization: Bearer <token>` header carries no
     * session cookie and cannot be forged cross-site — an attacker can neither
     * read the secret token nor set a custom Authorization header on a
     * cross-origin request without a CORS pre-flight the app never grants — so
     * CSRF is not applicable. Cookie/session requests (no bearer token) still
     * run the full parent check, so the browser UI keeps its CSRF protection.
     *
     * This lets the consolidated Career Comparison workflow API accept the MCP
     * API Key as a bearer token from a CLI/artisan client even though the route
     * shares the session-based `web` middleware group with the browser UI.
     *
     * @param  Request  $request
     * @return mixed
     */
    public function handle($request, Closure $next)
    {
        if (is_string($request->bearerToken())) {
            return $next($request);
        }

        return parent::handle($request, $next);
    }
}
