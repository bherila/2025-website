<?php

namespace Tests\Feature;

use App\Models\CareerJob;
use App\Models\OpportunityCostComparison;
use App\Models\User;
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

        $response = $this->get('/financial-planning/opportunity-cost/s/'.urlencode('a<b>c'));

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('a<b>c', $content);
        $this->assertStringContainsString('a\\u003Cb\\u003Ec', $content);
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
