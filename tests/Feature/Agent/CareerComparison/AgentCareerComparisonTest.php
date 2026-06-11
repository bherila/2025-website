<?php

namespace Tests\Feature\Agent\CareerComparison;

use App\Http\Controllers\Agent\CareerComparison\AgentCareerComparisonController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Http\Middleware\OptionalAgentRequest;
use App\Mcp\Servers\CareerComparison as CareerComparisonServer;
use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\User;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Support\Agent\AgentTokenService;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\CareerComparisonCapabilities;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Laravel\Mcp\Facades\Mcp;
use Tests\TestCase;

/**
 * Lane 3D — Career Comparison agent API + minimal MCP server.
 *
 * Anonymous access is read-only (public share read + compute, both redaction
 * and expiration preserved); private CRUD requires a module token plus
 * financial-planning.career-comparison.private (import-rsu: finance.rsu.view);
 * the web app's anonymous share-edit (PUT s/{code}) is NOT exposed; MCP
 * tools/list is filtered per user permission and token scope.
 */
class AgentCareerComparisonTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        // Mirror the routes/agent.php chokepoint registration (this vertical
        // branch does not edit shared route files; the integrator wires the
        // identical block into routes/agent.php).
        Route::prefix('api/agent/v1')->name('agent.')->middleware([NegotiatesAgentPayload::class])->group(function (): void {
            Route::prefix('career-comparison')->name('career-comparison.')->group(function (): void {
                Route::middleware(OptionalAgentRequest::class)->group(function (): void {
                    Route::get('/shares/{code}', [AgentCareerComparisonController::class, 'publicShare'])
                        ->name('shares.show');
                    Route::post('/compute', [AgentCareerComparisonController::class, 'compute'])
                        ->middleware('throttle:60,1')
                        ->name('compute');
                });

                Route::middleware(AuthenticateAgentRequest::class.':career-comparison')->group(function (): void {
                    Route::get('/latest', [AgentCareerComparisonController::class, 'latest'])
                        ->middleware('feature:financial-planning.career-comparison.private')
                        ->name('latest');
                    Route::put('/latest', [AgentCareerComparisonController::class, 'saveLatest'])
                        ->middleware('feature:financial-planning.career-comparison.private')
                        ->name('latest.save');
                    Route::post('/share', [AgentCareerComparisonController::class, 'createShare'])
                        ->middleware('feature:financial-planning.career-comparison.private')
                        ->name('share');
                    Route::patch('/shares/{code}', [AgentCareerComparisonController::class, 'updateShare'])
                        ->middleware('feature:financial-planning.career-comparison.private')
                        ->name('shares.update');
                    Route::delete('/shares/{code}', [AgentCareerComparisonController::class, 'deleteShare'])
                        ->middleware('feature:financial-planning.career-comparison.private')
                        ->name('shares.delete');
                    Route::post('/import-rsu', [AgentCareerComparisonController::class, 'importRsu'])
                        ->middleware('feature:finance.rsu.view')
                        ->name('import-rsu');
                });
            });
        });

        // Mirror the routes/ai.php chokepoint registration for the minimal
        // career-comparison MCP server (same integrator wiring note).
        Mcp::web('/mcp/career-comparison', CareerComparisonServer::class)
            ->middleware(AuthenticateAgentRequest::class.':career-comparison');
    }

    /** @return array{user: User, token: string} */
    private function createUserWithToken(array $permissions): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'career-comparison', null);

        return ['user' => $user, 'token' => $result['token']];
    }

    /** @return array<string, string> */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    /** @return array<string, mixed> */
    private function defaultInputs(): array
    {
        return CareerCompInputs::defaults();
    }

    private function createShareFor(User $user, bool $includesCurrent = true): CareerComparison
    {
        return app(CareerComparisonWorkflowService::class)->createShare(
            $user->id,
            CareerCompInputs::fromArray($this->defaultInputs()),
            $includesCurrent,
        );
    }

    private function mcp(string $rawToken, string $method, array $params = []): TestResponse
    {
        return $this->postJson('/mcp/career-comparison', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ], $this->bearer($rawToken));
    }

    /** @return list<string> */
    private function mcpToolNames(string $rawToken): array
    {
        $response = $this->mcp($rawToken, 'tools/list');
        $response->assertStatus(200);

        return collect($response->json('result.tools'))->pluck('name')->all();
    }

    // ------------------------------------------------------------------
    // Public share read (anonymous, read-only)
    // ------------------------------------------------------------------

    public function test_anonymous_share_read_returns_share(): void
    {
        $owner = $this->createUser();
        $share = $this->createShareFor($owner, includesCurrent: true);

        $response = $this->getJson("/api/agent/v1/career-comparison/shares/{$share->short_code}");

        $response->assertStatus(200)
            ->assertJsonPath('shortCode', $share->short_code)
            ->assertJsonPath('isCreator', false);
        $this->assertNotNull($response->json('inputs.currentJob'));
        $this->assertNotNull($response->json('projection'));
    }

    public function test_anonymous_share_read_redacts_confidential_current_job(): void
    {
        $owner = $this->createUser();
        $share = $this->createShareFor($owner, includesCurrent: false);

        $response = $this->getJson("/api/agent/v1/career-comparison/shares/{$share->short_code}");

        $response->assertStatus(200)
            ->assertJsonPath('isCreator', false)
            ->assertJsonPath('title', 'Career comparison')
            ->assertJsonPath('inputs.currentJob', null)
            ->assertJsonPath('inputs.currentJobs', []);
        $this->assertSame([], $response->json('projection.currentJobIds'));
    }

    public function test_creator_share_read_with_token_is_unredacted(): void
    {
        ['user' => $owner, 'token' => $token] = $this->createUserWithToken(['financial-planning.career-comparison.private']);
        $share = $this->createShareFor($owner, includesCurrent: false);

        $response = $this->getJson("/api/agent/v1/career-comparison/shares/{$share->short_code}", $this->bearer($token));

        $response->assertStatus(200)->assertJsonPath('isCreator', true);
        $this->assertNotNull($response->json('inputs.currentJob'));
    }

    public function test_expired_share_returns_404(): void
    {
        $owner = $this->createUser();
        $share = $this->createShareFor($owner);
        $share->update(['expires_at' => now()->subDay()]);

        $this->getJson("/api/agent/v1/career-comparison/shares/{$share->short_code}")->assertStatus(404);
    }

    public function test_unknown_share_returns_404(): void
    {
        $this->getJson('/api/agent/v1/career-comparison/shares/nope1234')->assertStatus(404);
    }

    public function test_anonymous_share_edit_is_not_exposed(): void
    {
        $owner = $this->createUser();
        $share = $this->createShareFor($owner);
        $before = $share->refresh()->updated_at;

        $this->putJson("/api/agent/v1/career-comparison/shares/{$share->short_code}", [
            'inputs' => $this->defaultInputs(),
        ])->assertStatus(405);

        $this->assertEquals($before, $share->refresh()->updated_at);
    }

    // ------------------------------------------------------------------
    // Public compute (anonymous, stateless)
    // ------------------------------------------------------------------

    public function test_anonymous_compute_returns_projection_without_persisting(): void
    {
        $comparisons = CareerComparison::query()->count();
        $jobs = CareerJob::query()->count();

        $response = $this->postJson('/api/agent/v1/career-comparison/compute', [
            'inputs' => $this->defaultInputs(),
        ]);

        $response->assertStatus(200);
        $this->assertSame((int) $this->defaultInputs()['startYear'], $response->json('startYear'));
        $this->assertSame($comparisons, CareerComparison::query()->count());
        $this->assertSame($jobs, CareerJob::query()->count());
    }

    public function test_compute_validates_inputs(): void
    {
        $this->postJson('/api/agent/v1/career-comparison/compute', ['inputs' => ['horizonYears' => 5]])
            ->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Private CRUD (token + permission)
    // ------------------------------------------------------------------

    public function test_private_endpoints_require_token(): void
    {
        $this->getJson('/api/agent/v1/career-comparison/latest')->assertStatus(401);
        $this->putJson('/api/agent/v1/career-comparison/latest', ['inputs' => $this->defaultInputs()])->assertStatus(401);
        $this->postJson('/api/agent/v1/career-comparison/share', ['inputs' => $this->defaultInputs()])->assertStatus(401);
        $this->postJson('/api/agent/v1/career-comparison/import-rsu', [])->assertStatus(401);
        $this->patchJson('/api/agent/v1/career-comparison/shares/abc12345', [])->assertStatus(401);
        $this->deleteJson('/api/agent/v1/career-comparison/shares/abc12345')->assertStatus(401);
    }

    public function test_private_endpoints_require_private_permission(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.rsu.view']);

        $this->getJson('/api/agent/v1/career-comparison/latest', $this->bearer($token))->assertStatus(403);
        $this->putJson('/api/agent/v1/career-comparison/latest', ['inputs' => $this->defaultInputs()], $this->bearer($token))
            ->assertStatus(403);
        $this->postJson('/api/agent/v1/career-comparison/share', ['inputs' => $this->defaultInputs()], $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_tokens_scoped_to_other_modules_are_rejected(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['financial-planning.career-comparison.private']);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'finance', null);

        $this->getJson('/api/agent/v1/career-comparison/latest', $this->bearer($result['token']))
            ->assertStatus(401);
    }

    public function test_latest_round_trip(): void
    {
        ['token' => $token] = $this->createUserWithToken(['financial-planning.career-comparison.private']);

        $this->getJson('/api/agent/v1/career-comparison/latest', $this->bearer($token))
            ->assertStatus(200)
            ->assertJsonPath('workflow', null);

        $saved = $this->putJson('/api/agent/v1/career-comparison/latest', [
            'inputs' => $this->defaultInputs(),
        ], $this->bearer($token));

        $saved->assertStatus(200)->assertJsonPath('shortCode', null);
        $this->assertNotNull($saved->json('projection'));

        $this->getJson('/api/agent/v1/career-comparison/latest', $this->bearer($token))
            ->assertStatus(200)
            ->assertJsonPath('workflow.id', $saved->json('id'));
    }

    public function test_save_latest_validates_inputs(): void
    {
        ['token' => $token] = $this->createUserWithToken(['financial-planning.career-comparison.private']);

        $this->putJson('/api/agent/v1/career-comparison/latest', [
            'inputs' => ['horizonYears' => 5],
        ], $this->bearer($token))->assertStatus(422);
    }

    public function test_share_create_update_delete_are_creator_only(): void
    {
        ['user' => $owner, 'token' => $ownerToken] = $this->createUserWithToken(['financial-planning.career-comparison.private']);
        ['token' => $otherToken] = $this->createUserWithToken(['financial-planning.career-comparison.private']);

        $created = $this->postJson('/api/agent/v1/career-comparison/share', [
            'inputs' => $this->defaultInputs(),
            'shareIncludesCurrent' => true,
        ], $this->bearer($ownerToken));

        $created->assertStatus(201);
        $code = $created->json('shortCode');
        $this->assertNotNull($code);
        $this->assertSame($owner->id, $created->json('ownerUserId'));

        $this->patchJson("/api/agent/v1/career-comparison/shares/{$code}", [
            'expiresAt' => now()->addDay()->toIso8601String(),
        ], $this->bearer($otherToken))->assertStatus(403);

        $this->patchJson("/api/agent/v1/career-comparison/shares/{$code}", [
            'expiresAt' => now()->addDay()->toIso8601String(),
        ], $this->bearer($ownerToken))->assertStatus(200);
        $this->assertNotNull(CareerComparison::query()->where('short_code', $code)->value('expires_at'));

        $this->deleteJson("/api/agent/v1/career-comparison/shares/{$code}", [], $this->bearer($otherToken))
            ->assertStatus(403);

        $this->deleteJson("/api/agent/v1/career-comparison/shares/{$code}", [], $this->bearer($ownerToken))
            ->assertStatus(200)
            ->assertJsonPath('deleted', true);
        $this->assertNull(CareerComparison::query()->where('short_code', $code)->first());
    }

    public function test_import_rsu_requires_rsu_permission(): void
    {
        ['token' => $token] = $this->createUserWithToken(['financial-planning.career-comparison.private']);

        $this->postJson('/api/agent/v1/career-comparison/import-rsu', [], $this->bearer($token))
            ->assertStatus(403);
    }

    public function test_import_rsu_returns_current_job_with_grants(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithToken([
            'financial-planning.career-comparison.private', 'finance.rsu.view',
        ]);

        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'SYN-GRANT-1',
            'symbol' => 'SYN',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-01-01',
            'share_count' => 200,
            'grant_price' => 12,
        ]);

        $response = $this->postJson('/api/agent/v1/career-comparison/import-rsu', [], $this->bearer($token));

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('importedGrants'));
        $this->assertSame(200.0, (float) $response->json('currentJob.rsuGrants.0.shareCount'));
    }

    // ------------------------------------------------------------------
    // MCP server (/mcp/career-comparison)
    // ------------------------------------------------------------------

    public function test_mcp_requires_bearer_token(): void
    {
        $this->postJson('/mcp/career-comparison', [
            'jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list', 'params' => [],
        ])->assertStatus(401);
    }

    public function test_mcp_tools_list_is_filtered_by_permission(): void
    {
        ['token' => $rsuOnly] = $this->createUserWithToken(['finance.rsu.view']);
        $names = $this->mcpToolNames($rsuOnly);

        $this->assertContains('career_get_public_share', $names);
        $this->assertContains('career_import_rsu', $names);
        $this->assertNotContains('career_get_latest_comparison', $names);
        $this->assertNotContains('career_save_latest_comparison', $names);

        ['token' => $full] = $this->createUserWithToken([
            'financial-planning.career-comparison.private', 'finance.rsu.view',
        ]);
        $this->assertEqualsCanonicalizing([
            'career_get_public_share',
            'career_get_latest_comparison',
            'career_save_latest_comparison',
            'career_import_rsu',
        ], $this->mcpToolNames($full));
    }

    public function test_mcp_hidden_tool_is_uninvokable(): void
    {
        ['token' => $token] = $this->createUserWithToken(['finance.rsu.view']);

        $denied = $this->mcp($token, 'tools/call', ['name' => 'career_get_latest_comparison', 'arguments' => []]);
        $denied->assertStatus(200);
        $this->assertStringContainsString('not found', (string) $denied->json('error.message'));
    }

    public function test_mcp_get_public_share_returns_redacted_share(): void
    {
        $owner = $this->createUser();
        $share = $this->createShareFor($owner, includesCurrent: false);
        ['token' => $token] = $this->createUserWithToken(['finance.rsu.view']);

        $response = $this->mcp($token, 'tools/call', [
            'name' => 'career_get_public_share',
            'arguments' => ['code' => $share->short_code],
        ]);

        $response->assertStatus(200);
        $this->assertNotTrue($response->json('result.isError'));
        $payload = json_decode((string) $response->json('result.content.0.text'), true);
        $this->assertSame($share->short_code, $payload['shortCode']);
        $this->assertFalse($payload['isCreator']);
        $this->assertNull($payload['inputs']['currentJob']);
        $this->assertSame('Career comparison', $payload['title']);
    }

    public function test_mcp_save_and_get_latest_round_trip(): void
    {
        ['token' => $token] = $this->createUserWithToken([
            'financial-planning.career-comparison.private', 'finance.rsu.view',
        ]);

        $saved = $this->mcp($token, 'tools/call', [
            'name' => 'career_save_latest_comparison',
            'arguments' => ['inputs' => $this->defaultInputs()],
        ]);
        $saved->assertStatus(200);
        $this->assertNotTrue($saved->json('result.isError'));
        $savedPayload = json_decode((string) $saved->json('result.content.0.text'), true);
        $this->assertNull($savedPayload['shortCode']);

        $latest = $this->mcp($token, 'tools/call', [
            'name' => 'career_get_latest_comparison',
            'arguments' => [],
        ]);
        $latest->assertStatus(200);
        $latestPayload = json_decode((string) $latest->json('result.content.0.text'), true);
        $this->assertSame($savedPayload['id'], $latestPayload['workflow']['id']);
    }

    public function test_mcp_save_latest_rejects_invalid_inputs(): void
    {
        ['token' => $token] = $this->createUserWithToken([
            'financial-planning.career-comparison.private', 'finance.rsu.view',
        ]);

        $response = $this->mcp($token, 'tools/call', [
            'name' => 'career_save_latest_comparison',
            'arguments' => ['inputs' => ['horizonYears' => 5]],
        ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('result.isError'));
        $this->assertSame(0, CareerComparison::query()->count());
    }

    // ------------------------------------------------------------------
    // Capability registrations
    // ------------------------------------------------------------------

    public function test_capabilities_register_with_expected_ids_and_permissions(): void
    {
        $registry = new CapabilityRegistry;
        CareerComparisonCapabilities::register($registry);

        $capabilities = collect($registry->forModule('career-comparison'))->keyBy('id');

        $this->assertEqualsCanonicalizing([
            'career_comparison.share.get',
            'career_comparison.compute',
            'career_comparison.latest.get',
            'career_comparison.latest.save',
            'career_comparison.share.create',
            'career_comparison.share.update',
            'career_comparison.share.delete',
            'career_comparison.import_rsu',
        ], $capabilities->keys()->all());

        $this->assertNull($capabilities['career_comparison.share.get']->requiredPermission);
        $this->assertNull($capabilities['career_comparison.compute']->requiredPermission);
        $this->assertSame(
            'financial-planning.career-comparison.private',
            $capabilities['career_comparison.latest.save']->requiredPermission,
        );
        $this->assertSame('finance.rsu.view', $capabilities['career_comparison.import_rsu']->requiredPermission);
        $this->assertSame('destructive', $capabilities['career_comparison.share.delete']->risk);
        $this->assertSame('career_get_public_share', $capabilities['career_comparison.share.get']->mcpTool);
        $this->assertSame('career_save_latest_comparison', $capabilities['career_comparison.latest.save']->mcpTool);
        $this->assertSame('career_import_rsu', $capabilities['career_comparison.import_rsu']->mcpTool);
    }
}
