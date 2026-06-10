<?php

namespace Tests\Feature\Agent;

use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\OptionalAgentRequest;
use App\Models\AgentApiToken;
use App\Models\User;
use App\Models\UserFeaturePermission;
use App\Support\Agent\AgentContext;
use App\Support\Agent\AgentTokenService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AgentTokenAuthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        Route::middleware(AuthenticateAgentRequest::class)->get('/_test/agent/protected', function () {
            return response()->json([
                'user_id' => Auth::id(),
                'has_scoped_token' => app(AgentContext::class)->token !== null,
            ]);
        });

        Route::middleware(OptionalAgentRequest::class)->get('/_test/agent/optional', function () {
            return response()->json(['anonymous' => app(AgentContext::class)->isAnonymous()]);
        });
    }

    private function service(): AgentTokenService
    {
        return app(AgentTokenService::class);
    }

    /** @return array{token: string, model: AgentApiToken, user: User} */
    private function createTokenForUser(array $permissions = ['finance.payslips.view'], string $module = 'finance'): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = $this->service()->createQuickSetupToken($user, $module, 'claude');

        return [...$result, 'user' => $user];
    }

    public function test_missing_token_returns_401(): void
    {
        $this->getJson('/_test/agent/protected')
            ->assertStatus(401)
            ->assertJsonStructure(['message']);
    }

    public function test_invalid_token_returns_401(): void
    {
        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer bha_not-a-real-token'])
            ->assertStatus(401);
    }

    public function test_expired_token_returns_401(): void
    {
        $user = $this->createUser();
        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->expired()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
        ]);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(401);
    }

    public function test_revoked_token_returns_401(): void
    {
        $user = $this->createUser();
        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->revoked()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
        ]);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(401);
    }

    public function test_disabled_user_token_returns_401(): void
    {
        $user = $this->createUser(['user_role' => 'disabled']);
        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
        ]);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(401);
    }

    public function test_valid_token_authenticates_and_updates_last_used_at(): void
    {
        ['token' => $rawToken, 'model' => $model, 'user' => $user] = $this->createTokenForUser();

        $this->assertNull($model->last_used_at);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->assertJson(['user_id' => $user->id, 'has_scoped_token' => true]);

        $this->assertNotNull($model->refresh()->last_used_at);
    }

    public function test_raw_token_is_not_stored_only_hash(): void
    {
        ['token' => $rawToken, 'model' => $model] = $this->createTokenForUser();

        $this->assertStringStartsWith('bha_', $rawToken);
        $this->assertSame(hash('sha256', $rawToken), $model->getAttributes()['token_hash']);
        $this->assertSame(substr($rawToken, 0, 12), $model->token_prefix);
        $this->assertNotContains($rawToken, $model->getAttributes());

        // token_hash must be hidden from serialization.
        $this->assertArrayNotHasKey('token_hash', $model->toArray());
    }

    public function test_legacy_mcp_api_key_still_authenticates(): void
    {
        $rawKey = bin2hex(random_bytes(32));
        $user = $this->createUser(['mcp_api_key' => hash('sha256', $rawKey)]);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$rawKey])
            ->assertStatus(200)
            ->assertJson(['user_id' => $user->id, 'has_scoped_token' => false]);
    }

    public function test_quick_setup_token_regeneration_revokes_prior_same_scope(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);

        $first = $this->service()->createQuickSetupToken($user, 'finance', 'claude');
        $otherModule = $this->service()->createQuickSetupToken($user, 'tax', 'claude');
        $otherClient = $this->service()->createQuickSetupToken($user, 'finance', 'codex');
        $second = $this->service()->createQuickSetupToken($user, 'finance', 'claude');

        $this->assertNotNull($first['model']->refresh()->revoked_at);
        $this->assertNull($second['model']->refresh()->revoked_at);
        $this->assertNull($otherModule['model']->refresh()->revoked_at);
        $this->assertNull($otherClient['model']->refresh()->revoked_at);

        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$first['token']])
            ->assertStatus(401);
        $this->getJson('/_test/agent/protected', ['Authorization' => 'Bearer '.$second['token']])
            ->assertStatus(200);
    }

    public function test_token_scope_cannot_exceed_user_permissions(): void
    {
        ['model' => $model, 'token' => $rawToken, 'user' => $user] = $this->createTokenForUser(['finance.payslips.view']);

        // Effective permissions = direct grant + dependency (finance.access);
        // the token scope is the module list intersected with exactly that.
        $this->assertEqualsCanonicalizing(
            ['finance.access', 'finance.payslips.view'],
            $model->allowed_permissions,
        );
        $this->assertNotContains('finance.accounts.manage', $model->allowed_permissions);

        $result = $this->service()->authenticate($rawToken);
        $this->assertNotNull($result);
        $context = new AgentContext($result['user'], $result['token']);
        $this->assertTrue($context->can('finance.payslips.view'));
        $this->assertFalse($context->can('finance.transactions.view'));
    }

    public function test_token_scope_is_clamped_for_admins_too(): void
    {
        $admin = $this->createAdminUser();
        $result = $this->service()->createQuickSetupToken($admin, 'career-comparison', null);

        $this->assertEqualsCanonicalizing(
            ['financial-planning.career-comparison.private', 'finance.rsu.view'],
            $result['model']->allowed_permissions,
        );

        $context = new AgentContext($admin, $result['model']);
        $this->assertTrue($context->can('finance.rsu.view'));
        $this->assertFalse($context->can('finance.transactions.view'));
    }

    public function test_permission_removal_revokes_access_for_unexpired_token(): void
    {
        ['token' => $rawToken, 'user' => $user] = $this->createTokenForUser(['finance.payslips.view']);

        $before = $this->service()->authenticate($rawToken);
        $this->assertNotNull($before);
        $this->assertTrue((new AgentContext($before['user'], $before['token']))->can('finance.payslips.view'));

        UserFeaturePermission::query()->where('user_id', $user->id)->delete();

        $after = $this->service()->authenticate($rawToken);
        $this->assertNotNull($after, 'Token itself remains valid; only the permission is gone.');
        $this->assertFalse((new AgentContext($after['user'], $after['token']))->can('finance.payslips.view'));
    }

    public function test_optional_middleware_allows_anonymous(): void
    {
        $this->getJson('/_test/agent/optional')
            ->assertStatus(200)
            ->assertJson(['anonymous' => true]);

        // A provided-but-invalid token is still rejected.
        $this->getJson('/_test/agent/optional', ['Authorization' => 'Bearer bha_bogus'])
            ->assertStatus(401);

        ['token' => $rawToken] = $this->createTokenForUser();
        $this->getJson('/_test/agent/optional', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->assertJson(['anonymous' => false]);
    }
}
