<?php

namespace App\Mcp\Support;

use App\Support\Access\FeatureAccess;
use App\Support\Agent\AgentContext;
use Illuminate\Support\Facades\Auth;

/**
 * Per-request MCP discovery filtering. laravel/mcp calls shouldRegister()
 * when resolving primitives (Primitive::eligibleForRegistration), which
 * filters BOTH tools/list and tools/call dispatch — a hidden primitive is
 * also uninvokable. The runtime requireFeaturePermission() checks in each
 * handle() remain as defense in depth.
 */
trait FiltersByFeature
{
    public function shouldRegister(): bool
    {
        $feature = static::requiredFeature();

        if ($feature === null) {
            return true;
        }

        if (app()->runningInConsole() && ! Auth::check()) {
            // Preserve stdio/`mcp:start` behavior; the runtime permission
            // check in handle() still guards every invocation.
            return true;
        }

        $user = Auth::user();

        if ($user === null || ! app(FeatureAccess::class)->can($user, $feature)) {
            return false;
        }

        $context = app()->bound(AgentContext::class) ? app(AgentContext::class) : null;

        return $context === null || $context->tokenAllows($feature);
    }
}
