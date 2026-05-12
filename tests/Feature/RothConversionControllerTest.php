<?php

namespace Tests\Feature;

use App\Models\FinPlanningRothScenario;
use App\Models\User;
use App\Services\Planning\RothConversionInputs;
use Tests\TestCase;

class RothConversionControllerTest extends TestCase
{
    public function test_roth_conversion_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning/roth-conversion');

        $response->assertStatus(200);
        $response->assertSee('Roth Conversion Planner');
        $response->assertSee('roth-conversion-initial-data');
    }

    public function test_compute_endpoint_is_public(): void
    {
        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => RothConversionInputs::defaults(),
        ]);

        $response->assertOk();
        $response->assertJsonPath('scenarios.0.name', 'Convert to top of 24%');
        $this->assertGreaterThan(20, count($response->json('scenarios.0.years')));
    }

    public function test_married_compute_requires_spouse_age_fields(): void
    {
        $inputs = RothConversionInputs::defaults();
        unset($inputs['people']['spouseBirthYear'], $inputs['people']['spouseCurrentAge'], $inputs['people']['spouseEndAge']);

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'inputs.people.spouseBirthYear',
            'inputs.people.spouseCurrentAge',
            'inputs.people.spouseEndAge',
        ]);
    }

    public function test_single_compute_allows_omitted_spouse_age_fields(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['filingStatus'] = 'single';
        unset($inputs['people']['spouseBirthYear'], $inputs['people']['spouseCurrentAge'], $inputs['people']['spouseEndAge']);

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
    }

    public function test_root_strategy_numbers_must_not_be_null(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['strategy']['annualConversion'] = null;
        $inputs['strategy']['bracketTarget'] = null;
        $inputs['strategy']['ltcgTargetRate'] = null;

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'inputs.strategy.annualConversion',
            'inputs.strategy.bracketTarget',
            'inputs.strategy.ltcgTargetRate',
        ]);
    }

    public function test_login_is_required_to_save_short_code(): void
    {
        $response = $this->postJson('/api/financial-planning/roth-conversion/save', [
            'title' => 'My scenario',
            'inputs' => RothConversionInputs::defaults(),
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_save_and_public_can_view_short_code(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/financial-planning/roth-conversion/save', [
            'title' => 'My scenario',
            'inputs' => RothConversionInputs::defaults(),
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $this->assertDatabaseHas('fin_planning_roth_scenarios', [
            'user_id' => $user->id,
            'short_code' => $shortCode,
        ]);

        $view = $this->get("/financial-planning/roth-conversion/s/{$shortCode}");
        $view->assertOk();
        $view->assertSee($shortCode);
    }

    public function test_shared_page_escapes_initial_json_script_data(): void
    {
        $this->withoutVite();
        $scenario = FinPlanningRothScenario::factory()->create([
            'title' => '</script><script>alert(1)</script>',
            'short_code' => 'safe123',
            'inputs_json' => RothConversionInputs::defaults(),
        ]);

        $response = $this->get("/financial-planning/roth-conversion/s/{$scenario->short_code}");

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E', $content);
    }

    public function test_only_owner_can_update_saved_scenario(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $scenario = FinPlanningRothScenario::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'x72ksh7',
        ]);

        $forbidden = $this->actingAs($other)->patchJson("/api/financial-planning/roth-conversion/s/{$scenario->short_code}", [
            'title' => 'Other update',
            'inputs' => RothConversionInputs::defaults(),
        ]);
        $forbidden->assertForbidden();

        $updatedInputs = RothConversionInputs::defaults();
        $updatedInputs['strategy']['annualConversion'] = 12345.0;
        $allowed = $this->actingAs($owner)->patchJson("/api/financial-planning/roth-conversion/s/{$scenario->short_code}", [
            'title' => 'Owner update',
            'inputs' => $updatedInputs,
        ]);
        $allowed->assertOk();

        $this->assertDatabaseHas('fin_planning_roth_scenarios', [
            'id' => $scenario->id,
            'title' => 'Owner update',
        ]);
    }

    public function test_saves_generate_unique_short_codes(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/financial-planning/roth-conversion/save', [
            'title' => 'First',
            'inputs' => RothConversionInputs::defaults(),
        ]);
        $second = $this->actingAs($user)->postJson('/api/financial-planning/roth-conversion/save', [
            'title' => 'Second',
            'inputs' => RothConversionInputs::defaults(),
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('shortCode'), $second->json('shortCode'));
    }
}
