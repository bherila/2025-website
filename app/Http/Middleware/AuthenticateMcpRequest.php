<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware that authenticates MCP requests via a Bearer token.
 *
 * Only a SHA-256 hash of the raw token is persisted in `mcp_api_key`, so a
 * database leak of this column cannot be used to impersonate a user directly.
 * When a valid hash match is found, Auth::setUser() sets the user for the
 * current request only (stateless — no session cookie is written).
 *
 * Usage: Apply this middleware to the MCP transport route in routes/ai.php.
 */
class AuthenticateMcpRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->extractBearerToken($request);

        if (! $token) {
            return response()->json(['error' => 'Unauthorized – Bearer token required'], 401);
        }

        // Only the SHA-256 hash of the raw token is stored; hash before lookup.
        $user = User::where('mcp_api_key', hash('sha256', $token))->first();

        if (! $user) {
            return response()->json(['error' => 'Unauthorized – invalid MCP API key'], 401);
        }

        // setUser is stateless — no session/cookie side-effects.
        Auth::setUser($user);

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
