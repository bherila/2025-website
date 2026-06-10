<?php

namespace App\Mcp\Support;

use App\Support\Access\FeatureAccess;
use App\Support\Agent\AgentContext;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Response;

trait AuthorizesFeatureAccess
{
    protected function requireFeaturePermission(string $permission): ?Response
    {
        $user = Auth::user();

        if (! $user) {
            return Response::error("Forbidden: missing required feature permission [{$permission}].");
        }

        $context = app(AgentContext::class);

        if ($this->shouldUseAgentContext($context, $user)) {
            return $context->can($permission)
                ? null
                : Response::error("Forbidden: missing required feature permission [{$permission}].");
        }

        if (! app(FeatureAccess::class)->can($user, $permission)) {
            return Response::error("Forbidden: missing required feature permission [{$permission}].");
        }

        return null;
    }

    private function shouldUseAgentContext(AgentContext $context, Authenticatable $user): bool
    {
        if ($context->token !== null) {
            return true;
        }

        return $context->user !== null
            && (string) $context->user->getAuthIdentifier() === (string) $user->getAuthIdentifier();
    }
}
