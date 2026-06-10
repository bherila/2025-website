<?php

namespace App\Http\Middleware;

use App\Support\Payload\AgentPayload;
use Closure;
use HelgeSverre\Toon\Exceptions\DecodeException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON/TOON content negotiation for the agent API (/api/agent/v1).
 *
 * Request side: a `text/toon` body is decoded (leniently) and replaces the
 * request input so Form Requests/validation see the same shape as JSON;
 * malformed TOON → 422; unsupported content types with a non-empty body →
 * 415. JSON (and bodyless requests) pass through untouched.
 *
 * Response side: when the client asks for TOON (`Accept: text/toon` or
 * `?format=toon`), JSON responses are re-encoded as TOON with the status
 * code preserved. `?format=json` forces JSON. Default is JSON.
 */
class NegotiatesAgentPayload
{
    public function handle(Request $request, Closure $next): Response
    {
        $rejection = $this->decodeRequestBody($request);

        if ($rejection !== null) {
            return $rejection;
        }

        return $this->encodeResponse($request, $next($request));
    }

    private function decodeRequestBody(Request $request): ?JsonResponse
    {
        $content = $request->getContent();

        if ($content === '') {
            return null;
        }

        $contentType = (string) $request->header('Content-Type', '');

        if (AgentPayload::isToonMediaType($contentType)) {
            try {
                $decoded = AgentPayload::decode($content);
            } catch (DecodeException $exception) {
                return response()->json([
                    'message' => 'Invalid TOON payload',
                    'error' => $exception->getMessage(),
                ], 422);
            }

            if (! is_array($decoded)) {
                return response()->json([
                    'message' => 'Invalid TOON payload',
                    'error' => 'Decoded payload must be an object or array.',
                ], 422);
            }

            $request->replace($decoded);

            return null;
        }

        if (trim($contentType) === '' || AgentPayload::isJsonMediaType($contentType)) {
            return null;
        }

        return response()->json([
            'message' => 'Unsupported Media Type. Use application/json or text/toon.',
        ], 415);
    }

    private function encodeResponse(Request $request, Response $response): Response
    {
        if (! $response instanceof JsonResponse || ! AgentPayload::wantsToon($request)) {
            return $response;
        }

        $toon = AgentPayload::encode($response->getData(true));

        $converted = new HttpResponse($toon, $response->getStatusCode());
        $converted->headers->replace($response->headers->all());
        $converted->headers->set('Content-Type', AgentPayload::TOON_CONTENT_TYPE);

        return $converted;
    }
}
