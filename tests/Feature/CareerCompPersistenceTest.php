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
    public function test_login_is_required_to_save_latest(): void
    {
        $this->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => CareerCompInputs::defaults(),
        ])->assertUnauthorized();
    }

    public function test_autosave_upserts_a_single_private_latest_with_null_short_code(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => CareerCompInputs::defaults(),
        ]);

        $first->assertOk();
        $first->assertJsonPath('shortCode', null);
        $this->assertSame((int) CareerCompInputs::defaults()['startYear'], $first->json('projection.startYear'));
        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'current']);
        $this->assertDatabaseHas('career_jobs', ['user_id' => $user->id, 'kind' => 'hypothetical']);

        $updatedInputs = CareerCompInputs::defaults();
        $updatedInputs['currentJob']['name'] = 'Updated current role';
        $second = $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => $updatedInputs,
        ]);

        $second->assertOk();
        $second->assertJsonPath('id', $first->json('id'));
        $second->assertJsonPath('inputs.currentJob.name', 'Updated current role');
        // Autosave never accumulates rows: exactly one private latest per user.
        $this->assertSame(1, CareerComparison::query()->where('user_id', $user->id)->whereNull('short_code')->count());
    }

    public function test_save_latest_validates_nested_jobs(): void
    {
        $user = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        unset($inputs['hypotheticalJobs'][0]['name'], $inputs['hypotheticalJobs'][0]['company']);
        $inputs['currentJob']['company']['type'] = 'not-a-type';

        $response = $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'inputs.hypotheticalJobs.0.name',
            'inputs.hypotheticalJobs.0.company',
            'inputs.currentJob.company.type',
        ]);
    }

    public function test_save_latest_validates_and_persists_projected_option_refresher_fields(): void
    {
        $user = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        $inputs['hypotheticalJobs'][0]['grantTypes'] = ['rsu' => false, 'options' => true];
        $inputs['hypotheticalJobs'][0]['refresher']['optionPctOfFullyDilutedShares'] = 0.75;
        $inputs['hypotheticalJobs'][0]['refresher']['optionType'] = 'iso';

        $response = $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('inputs.hypotheticalJobs.0.grantTypes.rsu', false);
        $response->assertJsonPath('inputs.hypotheticalJobs.0.grantTypes.options', true);
        $response->assertJsonPath('inputs.hypotheticalJobs.0.refresher.optionPctOfFullyDilutedShares', 0.75);
        $response->assertJsonPath('inputs.hypotheticalJobs.0.refresher.optionType', 'iso');

        $stored = CareerJob::query()
            ->where('user_id', $user->id)
            ->where('kind', 'hypothetical')
            ->firstOrFail();

        $this->assertFalse($stored->spec_json['grantTypes']['rsu']);
        $this->assertTrue($stored->spec_json['grantTypes']['options']);
        $this->assertSame(0.75, $stored->spec_json['refresher']['optionPctOfFullyDilutedShares']);
        $this->assertSame('iso', $stored->spec_json['refresher']['optionType']);
    }

    public function test_share_requires_login(): void
    {
        $this->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ])->assertUnauthorized();
    }

    public function test_share_forks_an_editable_copy_and_leaves_latest_untouched(): void
    {
        $user = User::factory()->create();
        $latest = $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $latestId = $latest->json('id');

        $share = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
            'shareIncludesCurrent' => false,
        ]);

        $share->assertCreated();
        $code = $share->json('shortCode');
        $this->assertIsString($code);
        $share->assertJsonPath('shareUrl', url("/financial-planning/career-comparison/s/{$code}"));
        $share->assertJsonPath('isCreator', true);

        // The private latest keeps its NULL code; the share is a separate owned, coded row.
        $this->assertDatabaseHas('opportunity_cost_comparisons', ['id' => $latestId, 'user_id' => $user->id, 'short_code' => null]);
        $this->assertDatabaseHas('opportunity_cost_comparisons', ['short_code' => $code, 'user_id' => $user->id, 'share_includes_current' => false]);
    }

    public function test_anyone_with_the_link_can_edit_a_shared_fork(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $share = $this->actingAs($owner)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $code = $share->json('shortCode');

        $editedInputs = CareerCompInputs::defaults();
        $editedInputs['currentJob']['name'] = 'Edited by a visitor';

        // A different user holding the link (not the creator) can still edit the fork.
        $response = $this->actingAs($visitor)->putJson("/api/financial-planning/career-comparison/s/{$code}", [
            'inputs' => $editedInputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('inputs.currentJob.name', 'Edited by a visitor');
    }

    public function test_show_by_code_is_editable_and_404s_when_expired(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $share = $this->actingAs($owner)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $code = $share->json('shortCode');

        $this->get("/financial-planning/career-comparison/s/{$code}")
            ->assertOk()
            ->assertSee('"canEdit":true', false);

        CareerComparison::query()->where('short_code', $code)->update(['expires_at' => now()->subDay()]);

        $this->get("/financial-planning/career-comparison/s/{$code}")->assertNotFound();
        $this->putJson("/api/financial-planning/career-comparison/s/{$code}", ['inputs' => CareerCompInputs::defaults()])->assertNotFound();
    }

    public function test_creator_can_set_expiration_and_delete_while_others_cannot(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $share = $this->actingAs($owner)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);
        $code = $share->json('shortCode');

        $this->actingAs($intruder)->patchJson("/api/financial-planning/career-comparison/s/{$code}", ['expiresAt' => '2030-01-01'])->assertForbidden();
        $this->actingAs($intruder)->deleteJson("/api/financial-planning/career-comparison/s/{$code}")->assertForbidden();

        $this->actingAs($owner)->patchJson("/api/financial-planning/career-comparison/s/{$code}", ['expiresAt' => '2030-01-01'])->assertOk();
        $this->assertNotNull(CareerComparison::query()->where('short_code', $code)->value('expires_at'));

        $this->actingAs($owner)->deleteJson("/api/financial-planning/career-comparison/s/{$code}")
            ->assertOk()
            ->assertJsonPath('deleted', true);
        $this->assertDatabaseMissing('opportunity_cost_comparisons', ['short_code' => $code]);
    }

    public function test_confidential_share_hides_current_from_non_creator_and_preserves_it_on_save(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['name'] = 'Confidential current';
        $share = $this->actingAs($owner)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => $inputs,
            'shareIncludesCurrent' => false,
        ]);
        $code = $share->json('shortCode');
        $storedCurrentJobId = CareerComparison::query()->where('short_code', $code)->value('current_job_id');

        // A non-creator's payload has the current job redacted; saving must not wipe the stored one.
        $redactedInputs = CareerCompInputs::defaults();
        $redactedInputs['currentJob'] = null;
        $redactedInputs['hypotheticalJobs'][0]['name'] = 'Visitor offer edit';

        $response = $this->actingAs($visitor)->putJson("/api/financial-planning/career-comparison/s/{$code}", [
            'inputs' => $redactedInputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('inputs.currentJob', null);
        $this->assertSame($storedCurrentJobId, CareerComparison::query()->where('short_code', $code)->value('current_job_id'));
    }

    public function test_published_share_is_marked_as_a_snapshot(): void
    {
        $user = User::factory()->create();
        $share = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => CareerCompInputs::defaults(),
        ]);

        $share->assertCreated();
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'short_code' => $share->json('shortCode'),
            'is_snapshot' => true,
        ]);
    }

    public function test_legacy_private_row_with_a_short_code_is_not_reachable_as_a_share(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $visitor = User::factory()->create();

        // A pre-share-model private workflow: it carried a code but was never published as a share.
        $legacy = CareerComparison::factory()->create([
            'user_id' => $owner->id,
            'is_snapshot' => false,
            'short_code' => 'legacy01',
            'hypothetical_job_ids' => [],
            'computed_json' => ['startYear' => 2026, 'horizonYears' => 10],
        ]);

        // It must not be viewable or editable by anyone holding the old link, including the owner.
        $this->get("/financial-planning/career-comparison/s/{$legacy->short_code}")->assertNotFound();
        $this->actingAs($visitor)
            ->putJson("/api/financial-planning/career-comparison/s/{$legacy->short_code}", ['inputs' => CareerCompInputs::defaults()])
            ->assertNotFound();
        $this->actingAs($owner)
            ->putJson("/api/financial-planning/career-comparison/s/{$legacy->short_code}", ['inputs' => CareerCompInputs::defaults()])
            ->assertNotFound();
    }

    public function test_legacy_short_code_backfill_clears_default_snapshot_rows(): void
    {
        $legacyDefaultSnapshot = CareerComparison::factory()->create([
            'is_snapshot' => true,
            'last_active_at' => null,
            'short_code' => 'legacy01',
        ]);
        $legacyPrivateLatest = CareerComparison::factory()->create([
            'is_snapshot' => false,
            'last_active_at' => now(),
            'short_code' => 'private1',
        ]);
        $publishedShare = CareerComparison::factory()->create([
            'is_snapshot' => true,
            'last_active_at' => now(),
            'short_code' => 'shared01',
        ]);

        $migration = require database_path('migrations/2026_06_06_000003_clear_short_codes_on_legacy_private_career_comparisons.php');
        $migration->up();

        $this->assertNull($legacyDefaultSnapshot->refresh()->short_code);
        $this->assertNull($legacyPrivateLatest->refresh()->short_code);
        $this->assertSame('shared01', $publishedShare->refresh()->short_code);
    }

    public function test_preserved_current_save_keeps_the_stored_projection_consistent_with_the_current_job(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['name'] = 'Confidential current';
        $share = $this->actingAs($owner)->postJson('/api/financial-planning/career-comparison/share', [
            'inputs' => $inputs,
            'shareIncludesCurrent' => false,
        ]);
        $code = $share->json('shortCode');
        $currentJobId = CareerComparison::query()->where('short_code', $code)->value('current_job_id');
        $this->assertNotNull($currentJobId);

        // A non-creator's payload has the current job redacted to null.
        $redactedInputs = CareerCompInputs::defaults();
        $redactedInputs['currentJob'] = null;
        $redactedInputs['hypotheticalJobs'][0]['name'] = 'Visitor offer edit';

        $this->actingAs($visitor)->putJson("/api/financial-planning/career-comparison/s/{$code}", [
            'inputs' => $redactedInputs,
        ])->assertOk();

        // The kept current_job_id and the stored projection must agree: the projection is recomputed
        // with the preserved current job, not recorded as a no-current-job scenario.
        $stored = CareerComparison::query()->where('short_code', $code)->firstOrFail();
        $this->assertSame((int) $currentJobId, (int) $stored->current_job_id);

        $currentSpecId = CareerJob::query()->find($currentJobId)?->spec_json['id'] ?? null;
        $projection = $stored->computed_json;
        $this->assertNotNull($projection['currentJobId'] ?? null);
        $this->assertSame($currentSpecId, $projection['currentJobId']);
        $this->assertNotEmpty($projection['deltasVsCurrent'] ?? []);
    }

    public function test_show_by_code_404s_for_unknown_code(): void
    {
        $this->withoutVite();
        $this->get('/financial-planning/career-comparison/s/nope9999')->assertNotFound();
    }

    public function test_show_auto_loads_latest_for_logged_in_user(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['name'] = 'Autoloaded role';
        $this->actingAs($user)->putJson('/api/financial-planning/career-comparison/latest', ['inputs' => $inputs]);

        $page = $this->actingAs($user)->get('/financial-planning/career-comparison');

        $page->assertOk();
        $page->assertSee('Autoloaded role');
        $page->assertSee('"canEdit":true', false);
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
        $content = (string) $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E', $content);
    }

    public function test_bearer_token_can_autosave_latest_with_mcp_api_key(): void
    {
        $token = 'mcp-token-for-test';
        $user = User::factory()->create(['mcp_api_key' => hash('sha256', $token)]);

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/financial-planning/career-comparison/latest', [
                'inputs' => CareerCompInputs::defaults(),
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('opportunity_cost_comparisons', [
            'user_id' => $user->id,
            'short_code' => null,
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

        $response = $this->actingAs($user)->postJson('/api/financial-planning/career-comparison/latest/import-rsu', [
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
