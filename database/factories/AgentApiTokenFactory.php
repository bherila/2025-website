<?php

namespace Database\Factories;

use App\Models\AgentApiToken;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AgentApiToken>
 */
class AgentApiTokenFactory extends Factory
{
    protected $model = AgentApiToken::class;

    public function definition(): array
    {
        $rawToken = 'bha_'.bin2hex(random_bytes(32));

        return [
            'user_id' => User::factory(),
            'name' => 'Test agent token',
            'purpose' => AgentApiToken::PURPOSE_PERSISTENT,
            'client_hint' => null,
            'module' => null,
            'token_hash' => hash('sha256', $rawToken),
            'token_prefix' => substr($rawToken, 0, 12),
            'allowed_permissions' => null,
            'expires_at' => null,
            'revoked_at' => null,
            'last_used_at' => null,
        ];
    }

    public function expired(): static
    {
        return $this->state(fn (): array => ['expires_at' => now()->subHour()]);
    }

    public function revoked(): static
    {
        return $this->state(fn (): array => ['revoked_at' => now()]);
    }
}
