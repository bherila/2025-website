<?php

namespace App\Support\Agent;

use App\Models\AgentApiToken;
use App\Models\User;
use App\Support\Access\FeatureAccess;

/**
 * Request-scoped agent identity, bound into the container by the agent auth
 * middleware. Token scopes only ever SHRINK access — including for admins:
 * a permission must pass both FeatureAccess AND the token's allowed list.
 */
final class AgentContext
{
    public function __construct(public ?User $user, public ?AgentApiToken $token) {}

    public function isAnonymous(): bool
    {
        return $this->user === null;
    }

    /**
     * Whether the bound token's scope permits the permission. A null token
     * (session or legacy mcp_api_key auth) and a null allowed list are
     * unscoped, i.e. allow everything the user can otherwise do.
     */
    public function tokenAllows(string $permission): bool
    {
        if ($this->token === null) {
            return true;
        }

        $allowed = $this->token->allowed_permissions;

        return $allowed === null || in_array($permission, $allowed, true);
    }

    public function can(string $permission): bool
    {
        if ($this->user === null) {
            return false;
        }

        return app(FeatureAccess::class)->can($this->user, $permission) && $this->tokenAllows($permission);
    }
}
