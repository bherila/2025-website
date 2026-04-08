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
 * The token is matched against the `mcp_api_key` column on the `users` table.
 * When a match is found, the corresponding user is logged in for the duration
 * of the request so that all finance model scopes (which filter by `auth()->id()`)
 * work correctly.
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

        $user = User::where('mcp_api_key', $token)->first();

        if (! $user) {
            return response()->json(['error' => 'Unauthorized – invalid MCP API key'], 401);
        }

        Auth::login($user);

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
