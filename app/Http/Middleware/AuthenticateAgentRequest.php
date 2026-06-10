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
 */
class AuthenticateAgentRequest
{
    public function __construct(private readonly AgentTokenService $tokenService) {}

    public function handle(Request $request, Closure $next): Response
    {
        $rawToken = $request->bearerToken();

        if ($rawToken === null || $rawToken === '') {
            return response()->json(['message' => 'Unauthenticated. Bearer token required.'], 401);
        }

        $result = $this->tokenService->authenticate($rawToken);

        if ($result === null) {
            return response()->json(['message' => 'Unauthenticated. Invalid, expired, or revoked token.'], 401);
        }

        Auth::setUser($result['user']);
        app()->instance(AgentContext::class, new AgentContext($result['user'], $result['token']));

        return $next($request);
    }
}
