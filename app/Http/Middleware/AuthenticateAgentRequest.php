<?php

namespace App\Http\Middleware;

use App\Support\Agent\AgentContext;
use App\Support\Agent\AgentTokenService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates agent API requests via `Authorization: Bearer <token>`.
 *
 * On success the user is set statelessly (no session/cookie side-effects) and
 * an AgentContext carrying the scoping token record is bound into the
 * container for downstream permission checks.
 *
 * An optional middleware parameter pins the route to one module (e.g.
 * `AuthenticateAgentRequest::class.':finance'`): agent tokens scoped to a
 * different module are rejected with 401, while module-less tokens (legacy
 * mcp_api_key fallbacks and persistent tokens with `module = null`) are
 * accepted and remain limited by their allowed_permissions scope.
 */
class AuthenticateAgentRequest
{
    public function __construct(private readonly AgentTokenService $tokenService) {}

    public function handle(Request $request, Closure $next, ?string $module = null): Response
    {
        $rawToken = $request->bearerToken();

        if ($rawToken === null || $rawToken === '') {
            return response()->json(['message' => 'Unauthenticated. Bearer token required.'], 401);
        }

        $result = $this->tokenService->authenticate($rawToken);

        if ($result === null) {
            return response()->json(['message' => 'Unauthenticated. Invalid, expired, or revoked token.'], 401);
        }

        if ($module !== null && $result['token']?->module !== null && $result['token']->module !== $module) {
            return response()->json(['message' => 'Unauthenticated. Token is not scoped to this module.'], 401);
        }

        Auth::setUser($result['user']);
        app()->instance(AgentContext::class, new AgentContext($result['user'], $result['token']));

        return $next($request);
    }
}
