<?php

namespace App\Http\Middleware;

use App\Support\Agent\AgentContext;
use App\Support\Agent\AgentTokenService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware that authenticates MCP requests via a Bearer token.
 *
 * Agent API tokens are authenticated through AgentTokenService; legacy MCP
 * keys stored on users.mcp_api_key are still accepted by that service. When a
 * valid token is found, Auth::setUser() sets the user for the current request
 * only (stateless — no session cookie is written).
 *
 * Usage: Apply this middleware to the MCP transport route in routes/ai.php.
 */
class AuthenticateMcpRequest
{
    public function __construct(private readonly AgentTokenService $tokenService) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->extractBearerToken($request);

        if (! $token) {
            return response()->json(['error' => 'Unauthorized – Bearer token required'], 401);
        }

        $result = $this->tokenService->authenticate($token);

        if ($result === null) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $scopedToken = $result['token'];
        if ($scopedToken !== null && $scopedToken->module !== 'finance') {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        // setUser is stateless — no session/cookie side-effects.
        Auth::setUser($result['user']);
        app()->instance(AgentContext::class, new AgentContext($result['user'], $scopedToken));

        return $next($request);
    }

    private function extractBearerToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');

        if (is_string($header) && str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }

        return null;
    }
}
