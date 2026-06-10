<?php

namespace App\Http\Middleware;

use App\Support\Agent\AgentContext;
use App\Support\Agent\AgentTokenService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Like AuthenticateAgentRequest, but a missing bearer token proceeds with an
 * anonymous AgentContext (public discovery endpoints). A token that IS
 * provided but invalid is still rejected with 401.
 */
class OptionalAgentRequest
{
    public function __construct(private readonly AgentTokenService $tokenService) {}

    public function handle(Request $request, Closure $next): Response
    {
        $rawToken = $request->bearerToken();

        if ($rawToken === null || $rawToken === '') {
            app()->instance(AgentContext::class, new AgentContext(null, null));

            return $next($request);
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
