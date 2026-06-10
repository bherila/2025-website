<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Support\Access\FeatureAccess;
use App\Support\Agent\AgentContext;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/agent/v1/me — identity + effective scope introspection for agent
 * clients. Anonymous requests succeed (OptionalAgentRequest) and report
 * authenticated=false with an empty permission list.
 */
class AgentMeController extends Controller
{
    public function __construct(private readonly FeatureAccess $featureAccess) {}

    public function __invoke(AgentContext $context): JsonResponse
    {
        $token = $context->token;

        return response()->json([
            'authenticated' => ! $context->isAnonymous(),
            'user' => $context->user === null ? null : [
                'id' => $context->user->id,
                'name' => $context->user->name,
            ],
            'token' => $token === null ? null : [
                'module' => $token->module,
                'purpose' => $token->purpose,
                'expires_at' => $token->expires_at?->toIso8601String(),
                'token_prefix' => $token->token_prefix,
            ],
            'permissions' => $this->scopedPermissions($context),
        ]);
    }

    /**
     * The user's effective permissions intersected with the token scope —
     * exactly what discovery filtering and runtime checks will allow.
     *
     * @return list<string>
     */
    private function scopedPermissions(AgentContext $context): array
    {
        if ($context->user === null) {
            return [];
        }

        $effective = $this->featureAccess->effectivePermissions($context->user);

        $scoped = array_values(array_filter(
            $effective,
            fn (string $permission): bool => $context->tokenAllows($permission),
        ));

        sort($scoped);

        return $scoped;
    }
}
