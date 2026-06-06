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

    public function test_anonymous_user_can_create_share_snapshot(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => true,
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $response->assertJsonPath('shareUrl', url("/financial-planning/career-comparison/s/{$shortCode}"));
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'short_code' => $shortCode,
            'user_id' => null,
            'is_snapshot' => true,
        ]);

        $this->withoutVite();
        $this->get("/financial-planning/career-comparison/s/{$shortCode}")->assertOk();
    }

    public function test_exclusive_share_snapshot_does_not_persist_current_job_at_rest(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['comp']['baseSalary'] = 987654;

        $response = $this->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => $inputs,
            'shareIncludesCurrent' => false,
        ]);

        $response->assertCreated();
        $comparison = CareerComparison::query()->where('short_code', $response->json('shortCode'))->firstOrFail();

        // The confidential current job must never reach the database, neither as a
        // career_jobs row nor inside the stored projection JSON.
        $this->assertNull($comparison->current_job_id);
        $this->assertNull($comparison->computed_json['currentJobId'] ?? null);
        $this->assertStringNotContainsString('987654', json_encode($comparison->computed_json));
        $this->assertSame([], $comparison->computed_json['deltasVsCurrent'] ?? null);
    }

    public function test_save_honors_share_includes_current_false(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => false,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('shareIncludesCurrent', false);
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'id' => $response->json('id'),
            'share_includes_current' => false,
        ]);
    }

    public function test_bearer_token_rejects_missing_invalid_and_non_loginable_keys(): void
    {
        $this->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
        ])->assertUnauthorized();

        $this->withHeader('Authorization', 'Bearer not-a-real-key')
            ->postJson('/api/financial-planning/career-comparison/workflows', [
                'inputs' => CareerCompInputs::defaults(),
            ])->assertUnauthorized();

        // User ID 1 is always treated as admin, so occupy that id first; the
        // locked-out user below then has no roles and cannot log in.
        User::factory()->create();
        $token = 'locked-out-token';
        User::factory()->create([
            'user_role' => '',
            'mcp_api_key' => hash('sha256', $token),
        ]);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/financial-planning/career-comparison/workflows', [
                'inputs' => CareerCompInputs::defaults(),
            ])->assertUnauthorized();
    }

    public function test_snapshots_are_excluded_from_workflow_list_last_active_and_get(): void
    {
        $user = User::factory()->create();
        $workflow = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'Real workflow',
        ]);
        $workflowId = $workflow->json('id');

        $snapshot = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $snapshot->assertCreated();
        $snapshotId = $snapshot->json('id');

        $list = $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows');
        $ids = array_column($list->json('workflows'), 'id');
        $this->assertContains($workflowId, $ids);
        $this->assertNotContains($snapshotId, $ids);

        $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows/last-active')
            ->assertJsonPath('workflow.id', $workflowId);

        $this->actingAs($user)->getJson("/api/financial-planning/career-comparison/workflows/{$snapshotId}")
            ->assertNotFound();
    }

    public function test_owned_share_snapshot_loads_read_only(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $snapshot = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $snapshot->assertCreated();

        $page = $this->actingAs($user)->get("/financial-planning/career-comparison/s/{$snapshot->json('shortCode')}");

        $page->assertOk();
        $page->assertSee('"canEdit":false', false);
    }

    public function test_claim_promotes_snapshot_to_editable_workflow(): void
    {
        $owner = User::factory()->create();
        $claimant = User::factory()->create();

        // An anonymous share snapshot (user_id null, is_snapshot true).
        $snapshot = $this->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $shortCode = $snapshot->json('shortCode');

        $claimed = $this->actingAs($claimant)->postJson("/api/financial-planning/career-comparison/s/{$shortCode}/claim");
        $claimed->assertOk();

        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'short_code' => $shortCode,
            'user_id' => $claimant->id,
            'is_snapshot' => false,
        ]);

        // After claiming it behaves like a workflow: it lists, auto-loads, and updates.
        $list = $this->actingAs($claimant)->getJson('/api/financial-planning/career-comparison/workflows');
        $this->assertContains($shortCode, array_column($list->json('workflows'), 'shortCode'));

        $workflowId = $claimed->json('id');
        $this->actingAs($claimant)->patchJson("/api/financial-planning/career-comparison/workflows/{$workflowId}", [
            'inputs' => CareerCompInputs::defaults(),
        ])->assertOk();

        // A different user still cannot claim or reach it.
        $this->actingAs($owner)->getJson("/api/financial-planning/career-comparison/workflows/{$workflowId}")
            ->assertNotFound();
    }

    public function test_activating_a_workflow_marks_it_last_active_and_clears_siblings(): void
    {
        $user = User::factory()->create();
        $first = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'First',
        ])->json('id');
        $second = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
            'title' => 'Second',
        ])->json('id');

        // Creating Second made it last-active; activating First should flip it back.
        $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows/last-active')
            ->assertJsonPath('workflow.id', $second);

        $this->actingAs($user)->postJson("/api/financial-planning/career-comparison/workflows/{$first}/activate")
            ->assertOk();

        $this->actingAs($user)->getJson('/api/financial-planning/career-comparison/workflows/last-active')
            ->assertJsonPath('workflow.id', $first);
        $this->assertNull(CareerComparison::query()->find($second)->last_active_at);
    }

    public function test_update_removes_orphaned_jobs_but_keeps_jobs_shared_with_another_workflow(): void
    {
        $user = User::factory()->create();
        $created = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $workflowId = $created->json('id');
        $comparison = CareerComparison::query()->findOrFail($workflowId);
        $staleCurrentJobId = $comparison->current_job_id;

        // A second workflow that references the first one's current job must protect it.
        CareerComparison::factory()->create([
            'user_id' => $user->id,
            'is_snapshot' => false,
            'current_job_id' => $staleCurrentJobId,
            'hypothetical_job_ids' => [],
        ]);

        $updated = CareerCompInputs::defaults();
        $updated['currentJob']['name'] = 'Renamed current role';
        $this->actingAs($user)->patchJson("/api/financial-planning/career-comparison/workflows/{$workflowId}", [
            'inputs' => $updated,
        ])->assertOk();

        // The original current job is still referenced by the sibling, so it survives.
        $this->assertDatabaseHas('career_jobs', ['id' => $staleCurrentJobId]);
    }

    public function test_delete_removes_jobs_no_longer_referenced(): void
    {
        $user = User::factory()->create();
        $created = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $workflowId = $created->json('id');
        $comparison = CareerComparison::query()->findOrFail($workflowId);
        $currentJobId = $comparison->current_job_id;

        $this->actingAs($user)->deleteJson("/api/financial-planning/career-comparison/workflows/{$workflowId}")
            ->assertOk();

        $this->assertDatabaseMissing('career_jobs', ['id' => $currentJobId]);
    }

    public function test_share_snapshots_edited_state_without_mutating_saved_workflow(): void
    {
        $user = User::factory()->create();
        $baseInputs = CareerCompInputs::defaults();
        $baseInputs['currentJob']['comp']['baseSalary'] = 100000;

        $workflow = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows', [
            'inputs' => $baseInputs,
        ]);
        $workflowId = $workflow->json('id');
        $this->assertSame(100000, (int) $workflow->json('inputs.currentJob.comp.baseSalary'));

        $editedInputs = $baseInputs;
        $editedInputs['currentJob']['comp']['baseSalary'] = 200000;
        $share = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => $editedInputs,
        ]);
        $share->assertCreated();

        // The snapshot reflects the edited state at click time...
        $this->assertSame(200000, (int) $share->json('inputs.currentJob.comp.baseSalary'));
        // ...while the saved workflow is untouched.
        $reloaded = $this->actingAs($user)->getJson("/api/financial-planning/career-comparison/workflows/{$workflowId}");
        $this->assertSame(100000, (int) $reloaded->json('inputs.currentJob.comp.baseSalary'));
    }

    public function test_import_rsu_requires_authentication(): void
    {
        $this->postJson('/api/financial-planning/career-comparison/workflows/import-rsu', [
            'currentJob' => CareerCompInputs::defaults()['currentJob'],
        ])->assertUnauthorized();
    }

    public function test_rsu_import_reconstructs_cliff_vesting_years_and_frequencies(): void
    {
        $user = User::factory()->create();

        // A 1-year cliff then annual vesting over 4 years.
        foreach (['2026-01-15', '2027-01-15', '2028-01-15', '2029-01-15'] as $vestDate) {
            FinEquityAwards::query()->create([
                'uid' => $user->id,
                'award_id' => 'ANNUAL',
                'grant_date' => '2025-01-15',
                'vest_date' => $vestDate,
                'share_count' => 100,
                'symbol' => 'AAA',
                'grant_price' => 50,
                'vest_price' => null,
            ]);
        }

        // Monthly vesting with no cliff.
        foreach (['2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01'] as $vestDate) {
            FinEquityAwards::query()->create([
                'uid' => $user->id,
                'award_id' => 'MONTHLY',
                'grant_date' => '2025-01-01',
                'vest_date' => $vestDate,
                'share_count' => 10,
                'symbol' => 'BBB',
                'grant_price' => 20,
                'vest_price' => null,
            ]);
        }

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows/import-rsu', [
            'currentJob' => CareerCompInputs::defaults()['currentJob'],
        ]);

        $response->assertOk();
        $grants = collect($response->json('currentJob.rsuGrants'))->keyBy('id');
        $this->assertCount(2, $grants);

        $annual = $grants->get('rsu-tool-annual');
        $this->assertNotNull($annual);
        $this->assertSame(400, (int) $annual['shareCount']);
        $this->assertSame(12, $annual['cliffMonths']);
        $this->assertSame(4, $annual['vestingYears']);
        $this->assertSame('annual', $annual['vestingFrequency']);
        $this->assertSame('2025-01-15', $annual['grantDate']);

        $monthly = $grants->get('rsu-tool-monthly');
        $this->assertNotNull($monthly);
        $this->assertSame(1, $monthly['cliffMonths']);
        $this->assertSame('monthly', $monthly['vestingFrequency']);
    }

    public function test_rsu_import_fills_unset_current_share_price_but_never_overwrites_user_value(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'PRICED',
            'grant_date' => '2025-01-15',
            'vest_date' => '2026-01-15',
            'share_count' => 100,
            'symbol' => 'AAA',
            'grant_price' => 30,
            'vest_price' => 150,
        ]);

        // currentSharePrice unset (0) -> filled from the latest market vest price.
        $unset = CareerCompInputs::defaults()['currentJob'];
        $unset['company']['currentSharePrice'] = 0;
        $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows/import-rsu', [
            'currentJob' => $unset,
        ])->assertOk()->assertJsonPath('currentJob.company.currentSharePrice', 150);

        // currentSharePrice already set by the user -> preserved untouched.
        $set = CareerCompInputs::defaults()['currentJob'];
        $set['company']['currentSharePrice'] = 99;
        $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/workflows/import-rsu', [
            'currentJob' => $set,
        ])->assertOk()->assertJsonPath('currentJob.company.currentSharePrice', 99);
    }
}
