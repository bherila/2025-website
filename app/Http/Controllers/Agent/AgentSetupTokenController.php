<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\CreateSetupTokenRequest;
use App\Models\AgentApiToken;
use App\Support\Agent\AgentTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Session-authenticated management of quick-setup agent tokens
 * (/api/agent/setup-tokens, `web`+`auth` — called from the logged-in browser
 * UI, NOT bearer auth).
 *
 * The raw token appears only in the store() response and is never logged;
 * listings expose only the prefix and metadata.
 */
class AgentSetupTokenController extends Controller
{
    public function __construct(private readonly AgentTokenService $tokenService) {}

    public function store(CreateSetupTokenRequest $request): JsonResponse
    {
        $module = (string) $request->input('module');
        $client = $request->input('client');
        $ttlMinutes = (int) ($request->input('ttl_minutes') ?? 240);

        $result = $this->tokenService->createQuickSetupToken($request->user(), $module, $client, $ttlMinutes);
        $model = $result['model'];

        return response()->json([
            'token' => $result['token'],
            'token_prefix' => $model->token_prefix,
            'expires_at' => $model->expires_at?->toIso8601String(),
            'module' => $module,
            'client' => $client,
            'mcp_url' => url('/mcp/'.$module),
            'capabilities_url' => url("/api/agent/v1/{$module}/capabilities.toon"),
            'openapi_url' => url('/api/agent/v1/openapi.json'),
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $tokens = AgentApiToken::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('revoked_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'tokens' => $tokens->map(fn (AgentApiToken $token): array => [
                'id' => $token->id,
                'name' => $token->name,
                'token_prefix' => $token->token_prefix,
                'module' => $token->module,
                'purpose' => $token->purpose,
                'client_hint' => $token->client_hint,
                'expires_at' => $token->expires_at?->toIso8601String(),
                'last_used_at' => $token->last_used_at?->toIso8601String(),
                'created_at' => $token->created_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $token = AgentApiToken::query()
            ->where('user_id', $request->user()->id)
            ->find($id);

        if ($token === null) {
            return response()->json(['message' => 'Token not found.'], 404);
        }

        $this->tokenService->revoke($token);

        return response()->json(['message' => 'Token revoked.']);
    }
}
