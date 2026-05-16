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

    public function test_compute_endpoint_returns_tax_aware_cash_shortfall_withdrawals(): void
    {
        $inputs = RothConversionInputs::defaults();
        $inputs['currentYear'] = 2026;
        $inputs['filingStatus'] = 'single';
        $inputs['people']['primaryCurrentAge'] = 60;
        $inputs['people']['primaryBirthYear'] = 1966;
        $inputs['people']['primaryEndAge'] = 60;
        $inputs['income']['wagesPrimary'] = 100000.0;
        $inputs['income']['wagesSpouse'] = 0.0;
        $inputs['income']['retirementAgePrimary'] = 61;
        $inputs['income']['retirementAgeSpouse'] = 60;
        $inputs['income']['selfEmploymentPrimary'] = 0.0;
        $inputs['income']['selfEmploymentSpouse'] = 0.0;
        $inputs['income']['interest'] = 0.0;
        $inputs['income']['taxExemptInterest'] = 0.0;
        $inputs['income']['qualifiedDividends'] = 0.0;
        $inputs['income']['longTermCapitalGains'] = 0.0;
        $inputs['income']['otherOrdinary'] = 0.0;
        $inputs['socialSecurity']['piaPrimary'] = 0.0;
        $inputs['socialSecurity']['piaSpouse'] = 0.0;
        $inputs['balances']['traditionalPrimary'] = 100000.0;
        $inputs['balances']['traditionalSpouse'] = 0.0;
        $inputs['balances']['rothPrimary'] = 0.0;
        $inputs['balances']['rothSpouse'] = 0.0;
        $inputs['balances']['hsa'] = 0.0;
        $inputs['balances']['cash'] = 0.0;
        $inputs['balances']['taxableBrokerage'] = 200000.0;
        $inputs['balances']['taxableBasis'] = 100000.0;
        $inputs['expenses']['propertyTax'] = 0.0;
        $inputs['expenses']['medicalExpense'] = 0.0;
        $inputs['expenses']['otherNondeductible'] = 120000.0;
        $inputs['strategy']['conversionMode'] = 'constant';
        $inputs['strategy']['annualConversion'] = 0.0;
        $inputs['strategy']['conversionStartAge'] = 60;
        $inputs['strategy']['conversionEndAge'] = 60;
        $inputs['strategy']['harvestLtcg'] = false;
        $inputs['assumptions']['preRetirementGrowthPercent'] = 0.0;
        $inputs['assumptions']['postRetirementGrowthPercent'] = 0.0;
        $inputs['assumptions']['cashYieldPercent'] = 0.0;
        $inputs['assumptions']['inflationPercent'] = 0.0;
        $inputs['assumptions']['stateTaxPercent'] = 0.0;
        $inputs['scenarios'] = [['name' => 'Cash shortfall', 'strategy' => []]];

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('scenarios.0.summary.cashShortfallTaxRecomputedYears', 1);
        $response->assertJsonPath('scenarios.0.years.0.cashShortfallWithdrawals.shortfall', 33170);
        $response->assertJsonPath('scenarios.0.years.0.cashShortfallWithdrawals.taxable', 35859.46);
        $response->assertJsonPath('scenarios.0.years.0.cashShortfallWithdrawals.taxableRealizedGain', 17929.74);
        $response->assertJsonPath('scenarios.0.years.0.cashShortfallWithdrawals.estimatedAdditionalTax', 2689.46);
        $response->assertJsonPath('warnings', []);
    }

    public function test_married_compute_requires_spouse_birth_and_end_age_fields(): void
    {
        $inputs = RothConversionInputs::defaults();
        unset($inputs['people']['spouseBirthYear'], $inputs['people']['spouseCurrentAge'], $inputs['people']['spouseEndAge']);

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'inputs.people.spouseBirthYear',
            'inputs.people.spouseEndAge',
        ]);
    }

    public function test_compute_derives_current_ages_from_birth_years(): void
    {
        $inputs = RothConversionInputs::defaults();
        unset($inputs['people']['primaryCurrentAge'], $inputs['people']['spouseCurrentAge']);
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 64;
        $inputs['people']['spouseBirthYear'] = $inputs['currentYear'] - 62;
        $inputs['people']['primaryEndAge'] = 64;
        $inputs['people']['spouseEndAge'] = 62;
        $inputs['scenarios'] = [['name' => 'No conversion', 'strategy' => ['conversionMode' => 'constant', 'annualConversion' => 0.0]]];

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('scenarios.0.years.0.primaryAge', 64);
        $response->assertJsonPath('scenarios.0.years.0.spouseAge', 62);
    }

    public function test_compute_rejects_birth_year_that_derives_child_age(): void
    {
        $inputs = RothConversionInputs::defaults();
        unset($inputs['people']['primaryCurrentAge']);
        $inputs['people']['primaryBirthYear'] = $inputs['currentYear'] - 17;

        $response = $this->postJson('/api/financial-planning/roth-conversion/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['inputs.people.primaryBirthYear']);
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
