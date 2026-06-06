<?php

namespace Tests\Unit\CareerComp;

use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\EquityValuationService;
use App\Services\Planning\CareerComp\JobSpec;
use App\Services\Planning\CareerComp\OptionsVestingService;
use App\Services\Planning\CareerComp\RsuVestingExpander;
use PHPUnit\Framework\TestCase;

class CareerCompCalculatorTest extends TestCase
{
    public function test_projection_matches_golden_fixture(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray($this->fixedInputs()))->toArray();
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../Fixtures/career-comparison/golden-projection.json'), true);

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

    public function test_rsu_quarterly_vesting_shifts_year_buckets_vs_monthly(): void
    {
        $grant = [
            'id' => 'rsu-1',
            'kind' => 'hire',
            'grantDate' => '2026-01-01',
            'shareCount' => 1200,
            'cliffMonths' => 0,
            'vestingYears' => 1,
        ];

        $monthly = (new RsuVestingExpander)->expand(
            JobSpec::nullableFromArray(['id' => 'm', 'name' => 'Monthly', 'rsuGrants' => [['vestingFrequency' => 'monthly'] + $grant]], false),
            2026,
            3,
        );
        $quarterly = (new RsuVestingExpander)->expand(
            JobSpec::nullableFromArray(['id' => 'q', 'name' => 'Quarterly', 'rsuGrants' => [['vestingFrequency' => 'quarterly'] + $grant]], false),
            2026,
            3,
        );

        // Monthly releases each month, so only the final (Jan 2027) month lands in 2027.
        $this->assertSame([2026 => 1100.0, 2027 => 100.0], $this->sharesByYear($monthly));
        // Quarterly releases every 3 months, pushing the fourth tranche into 2027.
        $this->assertSame([2026 => 900.0, 2027 => 300.0], $this->sharesByYear($quarterly));
    }

    public function test_rsu_annual_vesting_lands_in_a_single_year(): void
    {
        $rows = (new RsuVestingExpander)->expand(
            JobSpec::nullableFromArray([
                'id' => 'a',
                'name' => 'Annual',
                'rsuGrants' => [[
                    'id' => 'rsu-1',
                    'kind' => 'hire',
                    'grantDate' => '2026-01-01',
                    'shareCount' => 1200,
                    'cliffMonths' => 0,
                    'vestingYears' => 1,
                    'vestingFrequency' => 'annual',
                ]],
            ], false),
            2026,
            3,
        );

        $this->assertSame([2027 => 1200.0], $this->sharesByYear($rows));
    }

    public function test_rsu_missing_vesting_frequency_defaults_to_monthly(): void
    {
        $grant = [
            'id' => 'rsu-1',
            'kind' => 'hire',
            'grantDate' => '2026-04-01',
            'shareCount' => 1200,
            'cliffMonths' => 6,
            'vestingYears' => 2,
        ];

        $withoutFrequency = (new RsuVestingExpander)->expand(
            JobSpec::nullableFromArray(['id' => 'x', 'name' => 'X', 'rsuGrants' => [$grant]], false),
            2026,
            5,
        );
        $explicitMonthly = (new RsuVestingExpander)->expand(
            JobSpec::nullableFromArray(['id' => 'y', 'name' => 'Y', 'rsuGrants' => [['vestingFrequency' => 'monthly'] + $grant]], false),
            2026,
            5,
        );

        $this->assertSame($this->sharesByYear($withoutFrequency), $this->sharesByYear($explicitMonthly));
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

    public function test_multiple_rsu_grants_aggregate_vested_shares_per_year(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'multi-rsu',
            'name' => 'Multi RSU',
            'rsuGrants' => [
                ['id' => 'r-a', 'kind' => 'hire', 'grantDate' => '2026-01-01', 'shareCount' => 1200, 'cliffMonths' => 0, 'vestingYears' => 1, 'vestingFrequency' => 'annual'],
                ['id' => 'r-b', 'kind' => 'refresher', 'grantDate' => '2026-01-01', 'shareCount' => 600, 'cliffMonths' => 0, 'vestingYears' => 1, 'vestingFrequency' => 'annual'],
            ],
        ], false);

        $rows = (new RsuVestingExpander)->expand($job, 2026, 3);

        // Both annual grants release their full amount at the one-year mark and aggregate into 2027.
        $this->assertSame([2027 => 1800.0], $this->sharesByYear($rows));
    }

    public function test_multiple_option_grants_pool_iso_100k_limit_within_a_year(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'multi-iso',
            'name' => 'Multi ISO',
            'optionGrants' => [
                ['id' => 'iso-a', 'kind' => 'hire', 'type' => 'iso', 'grantDate' => '2026-01-01', 'shareCount' => 30000, 'strike' => 2, 'cliffMonths' => 12, 'vestingYears' => 1, 'earlyExercise83b' => false],
                ['id' => 'iso-b', 'kind' => 'refresher', 'type' => 'iso', 'grantDate' => '2026-01-01', 'shareCount' => 30000, 'strike' => 2, 'cliffMonths' => 12, 'vestingYears' => 1, 'earlyExercise83b' => false],
            ],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 3);

        $isoShares = 0.0;
        $nsoShares = 0.0;
        foreach ($result['rows'] as $row) {
            if ($row['year'] !== 2027) {
                continue;
            }
            if ($row['type'] === 'iso') {
                $isoShares += $row['vestedShares'];
            }
            if ($row['type'] === 'nso') {
                $nsoShares += $row['vestedShares'];
            }
        }

        // $100k / $2 strike = 50,000 ISO shares pooled across both grants; the rest spills to NSO.
        $this->assertSame(50000.0, $isoShares);
        $this->assertSame(10000.0, $nsoShares);
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
        $this->assertSame(2332.0, $valuation['annualEquity'][2028]);
        $this->assertSame(2332.0, $valuation['totals']['medium']);
    }

    public function test_equity_valuation_preserves_fractional_share_precision(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'fractional-rsu-job',
            'name' => 'Fractional RSU job',
            'company' => [
                'type' => 'public',
                'currentSharePrice' => 100,
            ],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
        ], false);

        $valuation = (new EquityValuationService)->value($job, [
            ['grantId' => 'rsu', 'type' => 'rsu', 'year' => 2026, 'vestedShares' => 0.004, 'exercisableShares' => 0],
        ], 2026, 1);

        $this->assertSame(0.4, $valuation['annualEquity'][2026]);
        $this->assertSame(0.4, $valuation['totals']['medium']);
    }

    public function test_iso_limit_warning_accounts_for_fractional_shares(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'fractional-iso-job',
            'name' => 'Fractional ISO job',
            'optionGrants' => [[
                'id' => 'iso-1',
                'kind' => 'hire',
                'type' => 'iso',
                'grantDate' => '2026-01-01',
                'shareCount' => 1000.004,
                'strike' => 100,
                'cliffMonths' => 0,
                'vestingYears' => 1,
                'earlyExercise83b' => true,
            ]],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 1);

        $this->assertSame('iso', $result['rows'][0]['type']);
        $this->assertSame(1000.0, $result['rows'][0]['exercisableShares']);
        $this->assertSame('nso', $result['rows'][1]['type']);
        $this->assertSame(0.004, $result['rows'][1]['exercisableShares']);
        $this->assertNotEmpty($result['warnings']);
    }

    public function test_calculator_preserves_fractional_option_exercise_outlay(): void
    {
        $inputs = $this->fixedInputs();
        $inputs['currentJob'] = null;
        $inputs['horizonYears'] = 1;
        $inputs['hypotheticalJobs'] = [[
            'id' => 'fractional-option-job',
            'name' => 'Fractional option job',
            'company' => [
                'type' => 'public',
                'currentSharePrice' => 100,
            ],
            'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
            'optionGrants' => [[
                'id' => 'nso-1',
                'kind' => 'hire',
                'type' => 'nso',
                'grantDate' => '2026-01-01',
                'shareCount' => 0.004,
                'strike' => 40,
                'cliffMonths' => 0,
                'vestingYears' => 1,
                'earlyExercise83b' => true,
            ]],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
        ]];

        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray($inputs))->toArray();
        $annual = $projection['jobs'][0]['annual'][0];

        $this->assertSame(0.4, $annual['vestedLiquidEquity']);
        $this->assertSame(0.16, $annual['exerciseOutlay']);
        $this->assertSame(0.24, $annual['freeCashFlow']);
    }

    public function test_private_share_price_rounding_is_stable_at_half_cent_boundaries(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-rounding-job',
            'name' => 'Private rounding job',
            'company' => [
                'type' => 'private',
                'fourNineA' => 10,
                'annualDilutionPct' => 3,
            ],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 15, 'highPct' => 30],
        ], false);

        $this->assertInstanceOf(JobSpec::class, $job);
        $this->assertSame(12.45, (new EquityValuationService)->sharePrice($job, 2, 'medium'));
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

        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray($inputs))->toArray();

        $this->assertSame([], $projection['deltasVsCurrent']);
        $this->assertCount(4, $projection['warnings']);
        $this->assertSame(-10000.0, $projection['jobs'][0]['annual'][0]['freeCashFlow']);
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $rows
     * @return array<int, float>
     */
    private function sharesByYear(array $rows): array
    {
        $byYear = [];
        foreach ($rows as $row) {
            $byYear[$row['year']] = ($byYear[$row['year']] ?? 0.0) + $row['vestedShares'];
        }

        return $byYear;
    }

    /** @return array<string, mixed> */
    private function fixedInputs(): array
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['startYear'] = 2026;
        $inputs['currentJob']['rsuGrants'][0]['grantDate'] = '2026-01-01';
        $inputs['hypotheticalJobs'][0]['company']['liquidityDate'] = '2030-01-01';
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['grantDate'] = '2026-01-01';

        return $inputs;
    }
}
