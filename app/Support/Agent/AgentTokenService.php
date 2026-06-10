<?php

namespace App\Support\Agent;

use App\Models\AgentApiToken;
use App\Models\User;
use App\Support\Access\FeatureAccess;
use Illuminate\Database\Eloquent\Builder;

/**
 * Issues, authenticates, and revokes agent API tokens.
 *
 * Raw tokens are never persisted — only the SHA-256 hash is stored, and the
 * raw value is returned exactly once at creation time. A legacy fallback
 * authenticates against `users.mcp_api_key` so existing MCP clients keep
 * working (those resolve with token = null, i.e. unscoped).
 */
class AgentTokenService
{
    public function __construct(private readonly FeatureAccess $featureAccess) {}

    /**
     * Create a temporary module-scoped quick-setup token.
     *
     * The token's allowed permissions are the module's permission list
     * intersected with the user's current effective permissions, so a token
     * can never grant more than the user already has. Prior quick-setup
     * tokens for the same (user, module, client hint) are revoked first.
     *
     * @return array{token: string, model: AgentApiToken}
     */
    public function createQuickSetupToken(User $user, string $module, ?string $clientHint, int $ttlMinutes = 240): array
    {
        $ttlMinutes = max(5, min(1440, $ttlMinutes));
        $rawToken = 'bha_'.bin2hex(random_bytes(32));

        $allowedPermissions = array_values(array_intersect(
            ModuleScope::permissions($module),
            $this->featureAccess->effectivePermissions($user),
        ));

        AgentApiToken::query()
            ->where('user_id', $user->id)
            ->where('purpose', AgentApiToken::PURPOSE_QUICK_SETUP)
            ->where('module', $module)
            ->when(
                $clientHint === null,
                fn (Builder $query): Builder => $query->whereNull('client_hint'),
                fn (Builder $query): Builder => $query->where('client_hint', $clientHint),
            )
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $model = AgentApiToken::query()->create([
            'user_id' => $user->id,
            'name' => sprintf('Quick setup: %s', $module),
            'purpose' => AgentApiToken::PURPOSE_QUICK_SETUP,
            'client_hint' => $clientHint,
            'module' => $module,
            'token_hash' => hash('sha256', $rawToken),
            'token_prefix' => substr($rawToken, 0, 12),
            'allowed_permissions' => $allowedPermissions,
            'expires_at' => now()->addMinutes($ttlMinutes),
        ]);

        return ['token' => $rawToken, 'model' => $model];
    }

    /**
     * Resolve a raw bearer token to a user (and scoping token record).
     *
     * @return array{user: User, token: AgentApiToken|null}|null
     */
    public function authenticate(string $rawToken): ?array
    {
        $hash = hash('sha256', $rawToken);

        $token = AgentApiToken::query()->where('token_hash', $hash)->first();

        if ($token !== null) {
            if (! $token->isValid()) {
                return null;
            }

            $user = $token->user;

            if ($user === null || ! $user->canLogin()) {
                return null;
            }

            $token->forceFill(['last_used_at' => now()])->saveQuietly();

            return ['user' => $user, 'token' => $token];
        }

        $legacyUser = User::query()->where('mcp_api_key', $hash)->first();

        if ($legacyUser === null || ! $legacyUser->canLogin()) {
            return null;
        }

        return ['user' => $legacyUser, 'token' => null];
    }

    public function revoke(AgentApiToken $token): void
    {
        if ($token->revoked_at === null) {
            $token->forceFill(['revoked_at' => now()])->save();
        }
    }
}
