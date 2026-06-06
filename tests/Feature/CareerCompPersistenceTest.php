<?php

namespace Tests\Feature;

use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\User;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\JobSpec;
use Tests\TestCase;

class CareerCompPersistenceTest extends TestCase
{
    public function test_login_is_required_to_save(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_save_persists_jobs_and_comparison(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => true,
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $response->assertJsonPath('shareUrl', url("/financial-planning/career-comparison/s/{$shortCode}"));
        $this->assertSame((int) CareerCompInputs::defaults()['startYear'], $response->json('projection.startYear'));

        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'current']);
        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'hypothetical']);
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'user_id' => $user->id,
            'short_code' => $shortCode,
            'share_includes_current' => true,
        ]);

        $comparison = CareerComparison::query()->where('short_code', $shortCode)->firstOrFail();
        $this->assertNotNull($comparison->current_job_id);
        $this->assertCount(1, $comparison->hypothetical_job_ids);
    }

    public function test_save_validates_nested_jobs(): void
    {
        $user = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        unset($inputs['hypotheticalJobs'][0]['name'], $inputs['hypotheticalJobs'][0]['company']);
        $inputs['currentJob']['company']['type'] = 'not-a-type';

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'inputs.hypotheticalJobs.0.name',
            'inputs.hypotheticalJobs.0.company',
            'inputs.currentJob.company.type',
        ]);
    }

    public function test_only_owner_can_update_saved_comparison(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $comparison = CareerComparison::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'occ12345',
        ]);

        $forbidden = $this->actingAs($other)->patchJson("/api/financial-planning/career-comparison/s/{$comparison->short_code}", [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $forbidden->assertForbidden();

        $allowed = $this->actingAs($owner)->patchJson("/api/financial-planning/career-comparison/s/{$comparison->short_code}", [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => false,
        ]);
        $allowed->assertOk();

        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'id' => $comparison->id,
            'share_includes_current' => false,
        ]);
        $this->assertDatabaseHas('career_jobs', ['user_id' => $owner->id, 'kind' => 'current']);
    }

    public function test_anonymous_comparison_can_be_claimed_by_authenticated_user(): void
    {
        $user = User::factory()->create();
        $currentJob = CareerJob::factory()->current()->create(['user_id' => null]);
        $hypotheticalJob = CareerJob::factory()->create(['user_id' => null]);
        $comparison = CareerComparison::factory()->create([
            'user_id' => null,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [$hypotheticalJob->id],
        ]);

        $response = $this->actingAs($user)->postJson("/api/financial-planning/career-comparison/s/{$comparison->short_code}/claim");

        $response->assertOk();
        $response->assertJsonPath('shortCode', $comparison->short_code);
        $this->assertDatabaseHas('opportunity_cost_comparisons', ['id' => $comparison->id, 'user_id' => $user->id]);
        $this->assertDatabaseHas('career_jobs', ['id' => $currentJob->id, 'user_id' => $user->id]);
        $this->assertDatabaseHas('career_jobs', ['id' => $hypotheticalJob->id, 'user_id' => $user->id]);
    }

    public function test_comparison_owned_by_another_user_cannot_be_claimed(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $comparison = CareerComparison::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/financial-planning/career-comparison/s/{$comparison->short_code}/claim");

        $response->assertForbidden();
        $this->assertDatabaseHas('opportunity_cost_comparisons', ['id' => $comparison->id, 'user_id' => $owner->id]);
    }

    public function test_shared_page_escapes_initial_json_script_data(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $spec = JobSpec::defaults(true);
        $spec['name'] = '</script><script>alert(1)</script>';
        $currentJob = CareerJob::factory()->create([
            'user_id' => $user->id,
            'kind' => 'current',
            'name' => $spec['name'],
            'spec_json' => $spec,
        ]);
        $comparison = CareerComparison::factory()->create([
            'user_id' => $user->id,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [],
            'short_code' => 'xss12345',
            'computed_json' => ['startYear' => 2026, 'horizonYears' => 10],
        ]);

        $response = $this->get("/financial-planning/career-comparison/s/{$comparison->short_code}");

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E', $content);
    }

    public function test_show_by_code_loads_saved_comparison_and_owner_can_edit(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $saved = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $shortCode = $saved->json('shortCode');

        $owner = $this->actingAs($user)->get("/financial-planning/career-comparison/s/{$shortCode}");
        $owner->assertOk();
        $owner->assertSee($shortCode);
        $owner->assertSee('"canEdit":true', false);
    }

    public function test_show_by_code_marks_non_owner_cannot_edit(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $currentJob = CareerJob::factory()->current()->create(['user_id' => $owner->id]);
        $comparison = CareerComparison::factory()->create([
            'user_id' => $owner->id,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [],
            'computed_json' => ['startYear' => 2026, 'horizonYears' => 10],
        ]);

        $guest = $this->get("/financial-planning/career-comparison/s/{$comparison->short_code}");

        $guest->assertOk();
        $guest->assertSee('"canEdit":false', false);
    }

    public function test_show_by_code_404s_for_unknown_code(): void
    {
        $this->withoutVite();

        $this->get('/financial-planning/career-comparison/s/nope9999')->assertNotFound();
    }

    public function test_saved_jobs_requires_authentication(): void
    {
        $this->getJson('/api/financial-planning/career-comparison/saved-jobs')->assertUnauthorized();
    }

    public function test_saved_jobs_returns_only_the_authenticated_users_jobs(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        CareerJob::factory()->create(['user_id' => $other->id, 'name' => 'Someone else job']);

        $response = $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/saved-jobs');

        $response->assertOk();
        $names = array_column($response->json('jobs'), 'name');
        $this->assertContains('Current role', $names);
        $this->assertNotContains('Someone else job', $names);
        foreach ($response->json('jobs') as $job) {
            $this->assertArrayHasKey('spec', $job);
            $this->assertArrayHasKey('kind', $job);
        }
    }

    public function test_saves_generate_unique_short_codes(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $second = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/save', [
            'inputs' => CareerCompInputs::defaults(),
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('shortCode'), $second->json('shortCode'));
    }

    public function test_workflow_crud_marks_last_active_and_enforces_ownership(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $created = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'Primary workflow',
        ]);

        $created->assertCreated();
        $workflowId = $created->json('id');
        $created->assertJsonPath('title', 'Primary workflow');
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'id' => $workflowId,
            'user_id' => $user->id,
            'is_snapshot' => false,
        ]);

        $this->actingAs($other)
            ->getJson("/api/financial-planning/career-comparison/workflows/{$workflowId}")
            ->assertNotFound();

        $list = $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows');
        $list->assertOk()->assertJsonPath('workflows.0.id', $workflowId);

        $updatedInputs = CareerCompInputs::defaults();
        $updatedInputs['currentJob']['name'] = 'Updated current role';
        $updated = $this->actingAs($user)->patchJson("/api/financial-planning/career-comparison/workflows/{$workflowId}", [
            'inputs' => $updatedInputs,
        ]);
        $updated->assertOk()->assertJsonPath('inputs.currentJob.name', 'Updated current role');

        $lastActive = $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows/last-active');
        $lastActive->assertOk()->assertJsonPath('workflow.id', $workflowId);

        $this->actingAs($user)->deleteJson("/api/financial-planning/career-comparison/workflows/{$workflowId}")
            ->assertOk()
            ->assertJsonPath('deleted', true);
        $this->assertDatabaseMissing('opportunity_cost_comparisons', ['id' => $workflowId]);
    }

    public function test_show_auto_loads_last_active_workflow_for_logged_in_user(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'Last active workflow',
        ]);

        $page = $this->actingAs($user)->get('/financial-planning/career-comparison');

        $page->assertOk();
        $page->assertSee('Last active workflow');
        $page->assertSee('"canEdit":true', false);
        $page->assertSee((string) $response->json('shortCode'));
    }

    public function test_share_creates_point_in_time_snapshot_without_mutating_workflow(): void
    {
        $user = User::factory()->create();
        $workflow = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'Saved workflow',
        ]);
        $workflowId = $workflow->json('id');
        $workflowCode = $workflow->json('shortCode');

        $share = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => false,
        ]);

        $share->assertCreated();
        $this->assertNotSame($workflowCode, $share->json('shortCode'));
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'id' => $workflowId,
            'is_snapshot' => false,
            'share_includes_current' => true,
        ]);
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'short_code' => $share->json('shortCode'),
            'is_snapshot' => true,
            'share_includes_current' => false,
        ]);
    }

    public function test_bearer_token_can_use_workflow_api_with_mcp_api_key(): void
    {
        $token = 'mcp-token-for-test';
        $user = User::factory()->create(['mcp_api_key' => hash('sha256', $token)]);

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/financial-planning/career-comparison/workflows', [
                'inputs' => CareerCompInputs::defaults(),
                'title' => 'CLI workflow',
            ]);

        $response->assertCreated();
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'user_id' => $user->id,
            'title' => 'CLI workflow',
            'is_snapshot' => false,
        ]);
    }

    public function test_rsu_import_maps_awards_into_current_job_without_overwriting_cash_comp(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2026-04-15',
            'share_count' => 25,
            'symbol' => 'TEST',
            'grant_price' => 10,
            'vest_price' => null,
        ]);
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-2026',
            'grant_date' => '2026-01-15',
            'vest_date' => '2026-07-15',
            'share_count' => 25,
            'symbol' => 'TEST',
            'grant_price' => 10,
            'vest_price' => null,
        ]);

        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['comp']['baseSalary'] = 222000;

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows/import-rsu', [
            'currentJob' => $inputs['currentJob'],
        ]);

        $response->assertOk();
        $response->assertJsonPath('currentJob.comp.baseSalary', 222000);
        $response->assertJsonPath('currentJob.rsuGrants.0.grantDate', '2026-01-15');
        $response->assertJsonPath('currentJob.rsuGrants.0.shareCount', 50);
        $response->assertJsonPath('currentJob.rsuGrants.0.grantPrice', 10);
        $response->assertJsonPath('currentJob.rsuGrants.0.vestingFrequency', 'quarterly');
    }
}
