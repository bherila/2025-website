<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON/TOON content negotiation for the agent API. Implemented in Lane 1D.
 */
class NegotiatesAgentPayload
{
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }
}
