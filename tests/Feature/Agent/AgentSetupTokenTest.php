<?php

namespace Tests\Feature\Agent;

use App\Models\AgentApiToken;
use App\Models\User;
use App\Support\Agent\AgentTokenService;
use Tests\TestCase;

class AgentSetupTokenTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();
    }

    private function user(array $permissions = ['finance.payslips.view']): User
    {
        return $this->grantFeatures($this->createUser(), $permissions);
    }

    public function test_requires_authentication(): void
    {
        $this->postJson('/api/agent/setup-tokens', ['module' => 'finance'])->assertStatus(401);
        $this->getJson('/api/agent/setup-tokens')->assertStatus(401);
        $this->deleteJson('/api/agent/setup-tokens/1')->assertStatus(401);
    }

    public function test_creates_quick_setup_token_with_defaults(): void
    {
        $user = $this->user();

        $response = $this->actingAs($user)
            ->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'client' => 'claude'])
            ->assertStatus(201)
            ->assertJsonStructure([
                'token', 'token_prefix', 'expires_at', 'module', 'client',
                'mcp_url', 'capabilities_url', 'openapi_url',
            ]);

        $rawToken = $response->json('token');
        $this->assertStringStartsWith('bha_', $rawToken);
        $this->assertSame(substr($rawToken, 0, 12), $response->json('token_prefix'));
        $this->assertSame('finance', $response->json('module'));
        $this->assertSame('claude', $response->json('client'));
        $this->assertStringEndsWith('/mcp/finance', $response->json('mcp_url'));
        $this->assertStringEndsWith('/api/agent/v1/finance/capabilities.toon', $response->json('capabilities_url'));
        $this->assertStringEndsWith('/api/agent/v1/openapi.json', $response->json('openapi_url'));

        $model = AgentApiToken::query()->where('user_id', $user->id)->sole();
        $this->assertSame(AgentApiToken::PURPOSE_QUICK_SETUP, $model->purpose);
        $this->assertSame(hash('sha256', $rawToken), $model->getAttributes()['token_hash']);

        // Default TTL is 240 minutes (4 hours).
        $this->assertEqualsWithDelta(240 * 60, now()->diffInSeconds($model->expires_at), 60);

        // The minted token authenticates against the bearer agent surface.
        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->assertJson(['authenticated' => true, 'token' => ['module' => 'finance']]);
    }

    public function test_creates_quick_setup_tokens_for_all_mcp_modules(): void
    {
        $user = $this->user([
            'finance.payslips.view',
            'finance.tax-preview.view',
            'financial-planning.career-comparison.private',
        ]);

        foreach (['tax', 'career-comparison'] as $module) {
            $response = $this->actingAs($user)
                ->postJson('/api/agent/setup-tokens', ['module' => $module])
                ->assertStatus(201);

            $this->assertSame($module, $response->json('module'));
            $this->assertStringEndsWith("/mcp/{$module}", $response->json('mcp_url'));
            $this->assertStringEndsWith("/api/agent/v1/{$module}/capabilities.toon", $response->json('capabilities_url'));

            $model = AgentApiToken::query()
                ->where('user_id', $user->id)
                ->where('module', $module)
                ->sole();
            $this->assertSame(AgentApiToken::PURPOSE_QUICK_SETUP, $model->purpose);
            $this->assertSame(hash('sha256', $response->json('token')), $model->getAttributes()['token_hash']);
        }
    }

    public function test_custom_ttl_is_applied(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'ttl_minutes' => 30])
            ->assertStatus(201);

        $model = AgentApiToken::query()->where('user_id', $user->id)->sole();
        $this->assertEqualsWithDelta(30 * 60, now()->diffInSeconds($model->expires_at), 60);
    }

    public function test_validation_rejects_bad_module_client_and_ttl(): void
    {
        $user = $this->user();

        $this->actingAs($user)->postJson('/api/agent/setup-tokens', [])
            ->assertStatus(422)->assertJsonValidationErrors(['module']);

        $this->actingAs($user)->postJson('/api/agent/setup-tokens', ['module' => 'phr'])
            ->assertStatus(422)->assertJsonValidationErrors(['module']);

        $this->actingAs($user)->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'client' => 'cursor'])
            ->assertStatus(422)->assertJsonValidationErrors(['client']);

        $this->actingAs($user)->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'ttl_minutes' => 4])
            ->assertStatus(422)->assertJsonValidationErrors(['ttl_minutes']);

        $this->actingAs($user)->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'ttl_minutes' => 1441])
            ->assertStatus(422)->assertJsonValidationErrors(['ttl_minutes']);
    }

    public function test_list_returns_non_revoked_tokens_without_secrets(): void
    {
        $user = $this->user();
        $service = app(AgentTokenService::class);
        $active = $service->createQuickSetupToken($user, 'finance', 'claude');
        $revoked = $service->createQuickSetupToken($user, 'tax', 'claude');
        $service->revoke($revoked['model']);

        // Another user's token must never appear.
        $service->createQuickSetupToken($this->user(), 'finance', 'claude');

        $response = $this->actingAs($user)->getJson('/api/agent/setup-tokens')->assertStatus(200);

        $tokens = $response->json('tokens');
        $this->assertCount(1, $tokens);
        $this->assertSame($active['model']->id, $tokens[0]['id']);
        $this->assertSame('finance', $tokens[0]['module']);
        $this->assertSame(AgentApiToken::PURPOSE_QUICK_SETUP, $tokens[0]['purpose']);
        $this->assertSame($active['model']->token_prefix, $tokens[0]['token_prefix']);
        $this->assertArrayHasKey('expires_at', $tokens[0]);
        $this->assertArrayHasKey('last_used_at', $tokens[0]);

        // Never the hash, never the raw token.
        $this->assertArrayNotHasKey('token_hash', $tokens[0]);
        $this->assertArrayNotHasKey('token', $tokens[0]);
        $this->assertStringNotContainsString($active['token'], $response->getContent());
    }

    public function test_revoke_makes_token_unusable(): void
    {
        $user = $this->user();
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'finance', 'claude');

        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$result['token']])
            ->assertStatus(200);

        $this->actingAs($user)
            ->deleteJson('/api/agent/setup-tokens/'.$result['model']->id)
            ->assertStatus(200);

        $this->assertNotNull($result['model']->refresh()->revoked_at);
        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$result['token']])
            ->assertStatus(401);
    }

    public function test_revoking_another_users_token_returns_404(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $result = app(AgentTokenService::class)->createQuickSetupToken($owner, 'finance', 'claude');

        $this->actingAs($other)
            ->deleteJson('/api/agent/setup-tokens/'.$result['model']->id)
            ->assertStatus(404);

        $this->assertNull($result['model']->refresh()->revoked_at);
    }

    public function test_regeneration_revokes_prior_token_for_same_module_and_client(): void
    {
        $user = $this->user();

        $first = $this->actingAs($user)
            ->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'client' => 'claude'])
            ->json('token');
        $second = $this->actingAs($user)
            ->postJson('/api/agent/setup-tokens', ['module' => 'finance', 'client' => 'claude'])
            ->json('token');

        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$first])->assertStatus(401);
        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$second])->assertStatus(200);
    }
}
