<?php

namespace Tests\Feature;

use App\Models\CareerJob;
use App\Models\OpportunityCostComparison;
use App\Models\User;
use App\Services\Planning\OpportunityCost\JobSpec;
use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use Tests\TestCase;

class OpportunityCostPersistenceTest extends TestCase
{
    public function test_login_is_required_to_save(): void
    {
        $response = $this->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_save_persists_jobs_and_comparison(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
            'shareIncludesCurrent' => true,
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $response->assertJsonPath('shareUrl', url("/financial-planning/opportunity-cost/s/{$shortCode}"));
        $this->assertSame((int) OpportunityCostInputs::defaults()['startYear'], $response->json('projection.startYear'));

        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'current']);
        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'hypothetical']);
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'user_id' => $user->id,
            'short_code' => $shortCode,
            'share_includes_current' => true,
        ]);

        $comparison = OpportunityCostComparison::query()->where('short_code', $shortCode)->firstOrFail();
        $this->assertNotNull($comparison->current_job_id);
        $this->assertCount(1, $comparison->hypothetical_job_ids);
    }

    public function test_save_validates_nested_jobs(): void
    {
        $user = User::factory()->create();
        $inputs = OpportunityCostInputs::defaults();
        unset($inputs['hypotheticalJobs'][0]['name'], $inputs['hypotheticalJobs'][0]['company']);
        $inputs['currentJob']['company']['type'] = 'not-a-type';

        $response = $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
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
        $comparison = OpportunityCostComparison::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'occ12345',
        ]);

        $forbidden = $this->actingAs($other)->patchJson("/api/financial-planning/opportunity-cost/s/{$comparison->short_code}", [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);
        $forbidden->assertForbidden();

        $allowed = $this->actingAs($owner)->patchJson("/api/financial-planning/opportunity-cost/s/{$comparison->short_code}", [
            'inputs' => OpportunityCostInputs::defaults(),
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
        $comparison = OpportunityCostComparison::factory()->create([
            'user_id' => null,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [$hypotheticalJob->id],
        ]);

        $response = $this->actingAs($user)->postJson("/api/financial-planning/opportunity-cost/s/{$comparison->short_code}/claim");

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
        $comparison = OpportunityCostComparison::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/financial-planning/opportunity-cost/s/{$comparison->short_code}/claim");

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
        $comparison = OpportunityCostComparison::factory()->create([
            'user_id' => $user->id,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [],
            'short_code' => 'xss12345',
            'computed_json' => ['startYear' => 2026, 'horizonYears' => 10],
        ]);

        $response = $this->get("/financial-planning/opportunity-cost/s/{$comparison->short_code}");

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E', $content);
    }

    public function test_show_by_code_loads_saved_comparison_and_owner_can_edit(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $saved = $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);
        $shortCode = $saved->json('shortCode');

        $owner = $this->actingAs($user)->get("/financial-planning/opportunity-cost/s/{$shortCode}");
        $owner->assertOk();
        $owner->assertSee($shortCode);
        $owner->assertSee('"canEdit":true', false);
    }

    public function test_show_by_code_marks_non_owner_cannot_edit(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $currentJob = CareerJob::factory()->current()->create(['user_id' => $owner->id]);
        $comparison = OpportunityCostComparison::factory()->create([
            'user_id' => $owner->id,
            'current_job_id' => $currentJob->id,
            'hypothetical_job_ids' => [],
            'computed_json' => ['startYear' => 2026, 'horizonYears' => 10],
        ]);

        $guest = $this->get("/financial-planning/opportunity-cost/s/{$comparison->short_code}");

        $guest->assertOk();
        $guest->assertSee('"canEdit":false', false);
    }

    public function test_show_by_code_404s_for_unknown_code(): void
    {
        $this->withoutVite();

        $this->get('/financial-planning/opportunity-cost/s/nope9999')->assertNotFound();
    }

    public function test_saved_jobs_requires_authentication(): void
    {
        $this->getJson('/api/financial-planning/opportunity-cost/saved-jobs')->assertUnauthorized();
    }

    public function test_saved_jobs_returns_only_the_authenticated_users_jobs(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);
        CareerJob::factory()->create(['user_id' => $other->id, 'name' => 'Someone else job']);

        $response = $this->actingAs($user)->getJson('/api/financial-planning/opportunity-cost/saved-jobs');

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

        $first = $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);
        $second = $this->actingAs($user)->postJson('/api/financial-planning/opportunity-cost/save', [
            'inputs' => OpportunityCostInputs::defaults(),
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('shortCode'), $second->json('shortCode'));
    }
}
