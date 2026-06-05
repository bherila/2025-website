<?php

namespace Tests\Unit\OpportunityCost;

use App\Services\Planning\OpportunityCost\EquityValuationService;
use App\Services\Planning\OpportunityCost\JobSpec;
use App\Services\Planning\OpportunityCost\OpportunityCostCalculator;
use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use App\Services\Planning\OpportunityCost\OptionsVestingService;
use App\Services\Planning\OpportunityCost\RsuVestingExpander;
use PHPUnit\Framework\TestCase;

class OpportunityCostCalculatorTest extends TestCase
{
    public function test_projection_matches_golden_fixture(): void
    {
        $projection = (new OpportunityCostCalculator)->project(OpportunityCostInputs::fromArray($this->fixedInputs()))->toArray();
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../Fixtures/opportunity-cost/golden-projection.json'), true);

        $this->assertSame($fixture, $projection);
    }

    public function test_rsu_vesting_honors_cliff_and_periodic_boundaries(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'rsu-job',
            'name' => 'RSU job',
            'rsuGrants' => [[
                'id' => 'rsu-1',
                'kind' => 'hire',
                'grantDate' => '2026-01-01',
                'shareCount' => 480,
                'cliffMonths' => 12,
                'vestingYears' => 4,
            ]],
        ], false);

        $rows = (new RsuVestingExpander)->expand($job, 2026, 5);

        $this->assertSame(2027, $rows[0]['year']);
        $this->assertSame(230.0, $rows[0]['vestedShares']);
        $this->assertSame(120.0, $rows[1]['vestedShares']);
    }

    public function test_options_partition_iso_limit_and_nso_spillover(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'options-job',
            'name' => 'Options job',
            'optionGrants' => [[
                'id' => 'iso-1',
                'kind' => 'hire',
                'type' => 'iso',
                'grantDate' => '2026-01-01',
                'shareCount' => 60000,
                'strike' => 2,
                'cliffMonths' => 12,
                'vestingYears' => 1,
                'earlyExercise83b' => false,
            ]],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 3);

        $this->assertSame('iso', $result['rows'][0]['type']);
        $this->assertSame(50000.0, $result['rows'][0]['exercisableShares']);
        $this->assertSame('nso', $result['rows'][1]['type']);
        $this->assertSame(10000.0, $result['rows'][1]['exercisableShares']);
        $this->assertNotEmpty($result['warnings']);
    }

    public function test_private_valuation_compounds_growth_dilution_and_gates_liquidity(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-job',
            'name' => 'Private job',
            'company' => [
                'type' => 'private',
                'fourNineA' => 10,
                'annualDilutionPct' => 10,
                'liquidityDate' => '2028-01-01',
            ],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 20, 'highPct' => 40],
        ], false);

        $valuation = (new EquityValuationService)->value($job, [
            ['grantId' => 'rsu', 'type' => 'rsu', 'year' => 2026, 'vestedShares' => 100, 'exercisableShares' => 0],
            ['grantId' => 'rsu', 'type' => 'rsu', 'year' => 2028, 'vestedShares' => 100, 'exercisableShares' => 0],
        ], 2026, 3);

        $this->assertSame(0.0, $valuation['liquidity']['medium'][0]['cumulativeValue']);
        $this->assertSame(2332.0, $valuation['liquidity']['medium'][2]['cumulativeValue']);
        $this->assertSame(1166.0, $valuation['totals']['medium']);
    }

    public function test_calculator_emits_warning_triggers_and_negative_fcf(): void
    {
        $inputs = $this->fixedInputs();
        $inputs['currentJob'] = null;
        $inputs['horizonYears'] = 2;
        $inputs['hypotheticalJobs'] = [[
            'id' => 'warn-job',
            'name' => 'Warning job',
            'company' => [
                'type' => 'private',
                'fourNineA' => 1,
                'liquidityDate' => '2035-01-01',
            ],
            'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
            'rsuGrants' => [[
                'id' => 'bad-rsu',
                'kind' => 'hire',
                'grantDate' => '2026-01-01',
                'shareCount' => 100,
                'cliffMonths' => 48,
                'vestingYears' => 1,
            ]],
            'optionGrants' => [[
                'id' => 'early',
                'kind' => 'hire',
                'type' => 'nso',
                'grantDate' => '2026-01-01',
                'shareCount' => 1000,
                'strike' => 10,
                'cliffMonths' => 0,
                'vestingYears' => 4,
                'earlyExercise83b' => true,
            ]],
            'growthBands' => ['lowPct' => 10, 'mediumPct' => 5, 'highPct' => 0],
        ]];

        $projection = (new OpportunityCostCalculator)->project(OpportunityCostInputs::fromArray($inputs))->toArray();

        $this->assertSame([], $projection['deltasVsCurrent']);
        $this->assertCount(4, $projection['warnings']);
        $this->assertSame(-10000.0, $projection['jobs'][0]['annual'][0]['freeCashFlow']);
    }

    /** @return array<string, mixed> */
    private function fixedInputs(): array
    {
        $inputs = OpportunityCostInputs::defaults();
        $inputs['startYear'] = 2026;
        $inputs['currentJob']['rsuGrants'][0]['grantDate'] = '2026-01-01';
        $inputs['hypotheticalJobs'][0]['company']['liquidityDate'] = '2030-01-01';
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['grantDate'] = '2026-01-01';

        return $inputs;
    }
}
