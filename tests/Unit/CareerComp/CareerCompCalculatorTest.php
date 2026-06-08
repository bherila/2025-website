<?php

namespace Tests\Unit\CareerComp;

use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\EquityValuationService;
use App\Services\Planning\CareerComp\JobSpec;
use App\Services\Planning\CareerComp\OptionsVestingService;
use App\Services\Planning\CareerComp\RsuVestingExpander;
use App\Support\Finance\FederalIncomeTax;
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

    public function test_option_vesting_can_start_after_grant_date(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'delayed-options-job',
            'name' => 'Delayed options job',
            'optionGrants' => [[
                'id' => 'iso-delayed',
                'kind' => 'hire',
                'type' => 'iso',
                'grantDate' => '2026-08-17',
                'vestingStartDate' => '2027-08-17',
                'shareCount' => 4800,
                'strike' => 2.8,
                'cliffMonths' => 12,
                'vestingYears' => 4,
                'vestingFrequency' => 'monthly',
                'earlyExercise83b' => false,
            ]],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 7);

        $this->assertSame([2028 => 1600.0, 2029 => 1200.0, 2030 => 1200.0, 2031 => 800.0], $this->sharesByYear($result['rows']));
    }

    public function test_early_exercise_preserves_service_vesting_for_economic_shares(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'early-options-job',
            'name' => 'Early options job',
            'optionGrants' => [[
                'id' => 'nso-early',
                'kind' => 'hire',
                'type' => 'nso',
                'grantDate' => '2026-01-01',
                'shareCount' => 1000,
                'strike' => 10,
                'cliffMonths' => 12,
                'vestingYears' => 4,
                'vestingFrequency' => 'monthly',
                'earlyExercise83b' => true,
            ]],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 3);
        $rowsByYear = [];
        foreach ($result['rows'] as $row) {
            $rowsByYear[$row['year']] = $row;
        }

        $this->assertSame(0.0, $rowsByYear[2026]['vestedShares']);
        $this->assertSame(1000.0, $rowsByYear[2026]['exercisableShares']);
        $this->assertSame(479.1667, $rowsByYear[2027]['vestedShares']);
        $this->assertSame(0.0, $rowsByYear[2027]['exercisableShares']);
        $this->assertSame(250.0, $rowsByYear[2028]['vestedShares']);
    }

    public function test_option_vesting_supports_weighted_tranche_schedule(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'weighted-options-job',
            'name' => 'Weighted options job',
            'optionGrants' => [[
                'id' => 'nso-weighted',
                'kind' => 'hire',
                'type' => 'nso',
                'grantDate' => '2026-01-01',
                'shareCount' => 1000,
                'strike' => 1,
                'cliffMonths' => 12,
                'vestingYears' => 4,
                'vestingFrequency' => 'annual',
                'earlyExercise83b' => false,
                'vestingSchedule' => [
                    'type' => 'tranches',
                    'presetId' => 'annual-40-30-20-10',
                    'tranches' => [
                        ['month' => 12, 'percent' => 40],
                        ['month' => 24, 'percent' => 30],
                        ['month' => 36, 'percent' => 20],
                        ['month' => 48, 'percent' => 10],
                    ],
                ],
            ]],
        ], false);

        $result = (new OptionsVestingService)->expand($job, 2026, 5);

        $this->assertSame([2027 => 400.0, 2028 => 300.0, 2029 => 200.0, 2030 => 100.0], $this->sharesByYear($result['rows']));
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
        ], [], 2026, 3);

        $this->assertSame(0.0, $valuation['liquidity']['medium'][0]['cumulativeValue']);
        $this->assertSame(2332.0, $valuation['liquidity']['medium'][2]['cumulativeValue']);
        $this->assertSame(2332.0, $valuation['annualEquity'][2028]);
        $this->assertSame(2332.0, $valuation['totals']['medium']);
    }

    public function test_private_valuation_prefers_estimated_share_price_over_409a(): void
    {
        $job = JobSpec::nullableFromArray([
            'id' => 'private-option-job',
            'name' => 'Private option job',
            'company' => [
                'type' => 'private',
                'currentSharePrice' => 30,
                'fourNineA' => 3,
                'annualDilutionPct' => 0,
                'liquidityDate' => '2026-01-01',
            ],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
        ], false);

        $valuation = (new EquityValuationService)->value($job, [
            ['grantId' => 'opt', 'type' => 'iso', 'year' => 2026, 'vestedShares' => 100, 'exercisableShares' => 100],
        ], [], 2026, 1);

        $this->assertSame(3000.0, $valuation['annualEquity'][2026]);
        $this->assertSame(3000.0, $valuation['totals']['medium']);
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
        ], [], 2026, 1);

        $this->assertSame(0.4, $valuation['annualEquity'][2026]);
        $this->assertSame(0.4, $valuation['totals']['medium']);
    }

    public function test_annual_raise_compounds_base_and_bonus(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 3,
            'currentJob' => [
                'id' => 'c',
                'name' => 'C',
                'company' => ['type' => 'public', 'currentSharePrice' => 100],
                'comp' => ['baseSalary' => 100000, 'cashBonus' => 10000, 'annualRaisePct' => 10],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ],
            'hypotheticalJobs' => [],
        ]))->toArray();

        $job = $projection['jobs'][0];
        $this->assertSame(100000.0, $job['annual'][0]['salary']);
        $this->assertSame(110000.0, $job['annual'][1]['salary']);
        $this->assertSame(121000.0, $job['annual'][2]['salary']);
        $this->assertSame(11000.0, $job['annual'][1]['bonus']);
        // (110000) + (121000) + (133100) = 364100 across base + bonus.
        $this->assertSame(364100.0, $job['lifetime']['totalCashComp']);
    }

    public function test_rsu_refresher_grants_resolve_shares_per_growth_band(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 3,
            'currentJob' => [
                'id' => 'c',
                'name' => 'C',
                'company' => ['type' => 'public', 'currentSharePrice' => 100],
                'comp' => ['baseSalary' => 100000, 'cashBonus' => 0, 'annualRaisePct' => 0],
                // One refresher granted in 2027 (offset 1), vesting fully one year later (2028).
                'refresher' => ['pctOfBase' => 100, 'cadenceYears' => 10, 'firstYearOffset' => 1, 'vestingYears' => 1, 'cliffMonths' => 0, 'vestingFrequency' => 'annual'],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 100, 'highPct' => 200],
            ],
            'hypotheticalJobs' => [],
        ]))->toArray();

        $job = $projection['jobs'][0];
        // $100k granted at the 2027 price (low 100 / med 200) buys 1000 / 500 shares, realized at the
        // 2028 price (low 100 / med 400) → 100k / 200k. Higher band buys fewer shares but worth more.
        $this->assertSame(100000.0, $job['lifetime']['totalEquityValue']['low']);
        $this->assertSame(200000.0, $job['lifetime']['totalEquityValue']['medium']);
        $this->assertGreaterThan(290000.0, $job['lifetime']['totalEquityValue']['high']);
        $this->assertSame(300000.0, $job['lifetime']['totalCashComp']);

        $refresherRows = array_values(array_filter($job['vesting'], fn (array $row): bool => str_contains((string) $row['grantId'], 'refresher')));
        $this->assertNotEmpty($refresherRows);
        $this->assertSame(2028, $refresherRows[0]['year']);
    }

    public function test_projected_iso_refresher_creates_option_vesting_rows(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 4,
            'currentJob' => [
                'id' => 'proj',
                'name' => 'Projected ISO job',
                'company' => ['type' => 'public', 'currentSharePrice' => 10, 'fullyDilutedShares' => 1000000],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'refresher' => [
                    'optionPctOfFullyDilutedShares' => 1,
                    'optionType' => 'iso',
                    'cadenceYears' => 10,
                    'firstYearOffset' => 1,
                    'vestingYears' => 1,
                    'cliffMonths' => 0,
                    'vestingFrequency' => 'annual',
                ],
                'growthBands' => ['lowPct' => -1, 'mediumPct' => 0, 'highPct' => 1],
            ],
            'hypotheticalJobs' => [],
        ]))->toArray();

        $refresherRows = array_values(array_filter(
            $projection['jobs'][0]['vesting'],
            fn (array $row): bool => (string) ($row['grantId'] ?? '') === 'proj-option-refresher-2027',
        ));

        $this->assertCount(1, $refresherRows);
        $this->assertSame('iso', $refresherRows[0]['type']);
        $this->assertSame(2028, $refresherRows[0]['year']);
        $this->assertSame(10000.0, $refresherRows[0]['exercisableShares']);
        $this->assertSame('projected_refresher', $refresherRows[0]['source']);
        $this->assertSame(100000.0, $projection['jobs'][0]['annual'][2]['exerciseOutlay']);
    }

    public function test_projected_iso_refresher_spills_excess_over_iso_limit_into_nso(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 4,
            'currentJob' => [
                'id' => 'proj-spill',
                'name' => 'Projected ISO spill job',
                'company' => ['type' => 'public', 'currentSharePrice' => 10, 'fullyDilutedShares' => 1000000],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'refresher' => [
                    'optionPctOfFullyDilutedShares' => 2,
                    'optionType' => 'iso',
                    'cadenceYears' => 10,
                    'firstYearOffset' => 1,
                    'vestingYears' => 1,
                    'cliffMonths' => 0,
                    'vestingFrequency' => 'annual',
                ],
                'growthBands' => ['lowPct' => -1, 'mediumPct' => 0, 'highPct' => 1],
            ],
            'hypotheticalJobs' => [],
        ]))->toArray();

        $refresherRows = array_values(array_filter(
            $projection['jobs'][0]['vesting'],
            fn (array $row): bool => (string) ($row['grantId'] ?? '') === 'proj-spill-option-refresher-2027',
        ));

        $this->assertCount(2, $refresherRows);
        $this->assertSame(['iso', 'nso'], array_column($refresherRows, 'type'));
        $this->assertSame([10000.0, 10000.0], array_column($refresherRows, 'exercisableShares'));
        $this->assertContains(
            'Projected ISO spill job: ISO first-exercisable value exceeds $100k in 2028; spillover treated as NSO.',
            $projection['warnings'],
        );
    }

    public function test_private_scenario_liquidity_realizes_exit_value_and_capital_gain(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2023,
            'horizonYears' => 3,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-exit',
                'name' => 'Private exit',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [
                            ['year' => 2023, 'stage' => 'A', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 10, 'liquidityEvent' => false],
                            ['year' => 2025, 'stage' => 'IPO/Exit', 'preferredPostMoneyValuation' => 500000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 500, 'liquidityEvent' => true],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'owned-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2023-01-01',
                    'shareCount' => 1000,
                    'strike' => 5,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => -1, 'mediumPct' => 0, 'highPct' => 1],
            ]],
        ]))->toArray();

        $job = $projection['jobs'][0];

        $this->assertSame(0.0, $job['liquidity']['medium'][0]['cumulativeValue']);
        $this->assertSame(0.0, $job['liquidity']['medium'][1]['cumulativeValue']);
        $this->assertSame(500000.0, $job['liquidity']['medium'][2]['cumulativeValue']);
        $this->assertSame(500000.0, $job['annual'][2]['shareSaleProceeds']);
        $this->assertSame(10000.0, $job['annual'][2]['equitySaleBasis']);
        $this->assertSame(490000.0, $job['annual'][2]['equityCapitalGain']);
        $this->assertSame(500000.0, $job['lifetime']['totalEquityValue']['low']);
        $this->assertSame(500000.0, $job['lifetime']['totalEquityValue']['medium']);
        $this->assertSame(500000.0, $job['lifetime']['totalEquityValue']['high']);
        $this->assertSame(5000.0, $job['afterTax']['annual'][0]['nsoOrdinaryIncome']);
        $this->assertSame(490000.0, $job['afterTax']['annual'][2]['equityCapitalGain']);
        $this->assertGreaterThan(0.0, $job['afterTax']['lifetime']['totalValue']['low']);
        $this->assertSame($job['afterTax']['lifetime']['totalValue']['medium'], $job['afterTax']['lifetime']['totalValue']['low']);
        $this->assertSame($job['afterTax']['lifetime']['totalValue']['medium'], $job['afterTax']['lifetime']['totalValue']['high']);
        $this->assertNotContains('Private exit: private liquidity date is beyond the planning horizon; equity never realizes.', $projection['warnings']);
    }

    public function test_private_scenario_after_tax_lifetime_uses_each_outcome_tax(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2023,
            'horizonYears' => 3,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-multi-exit',
                'name' => 'Private multi exit',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'fourNineA' => 0,
                    'valuationScenarios' => [
                        [
                            'id' => 'low',
                            'label' => 'Low',
                            'outcome' => 'low',
                            'stages' => [
                                ['year' => 2023, 'stage' => 'A', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmvDiscountPct' => 100, 'commonFmv' => 0, 'liquidityEvent' => false],
                                ['year' => 2025, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => true],
                            ],
                        ],
                        [
                            'id' => 'medium',
                            'label' => 'Medium',
                            'outcome' => 'medium',
                            'stages' => [
                                ['year' => 2023, 'stage' => 'A', 'preferredPostMoneyValuation' => 500000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmvDiscountPct' => 100, 'commonFmv' => 0, 'liquidityEvent' => false],
                                ['year' => 2025, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 500000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 500, 'liquidityEvent' => true],
                            ],
                        ],
                        [
                            'id' => 'high',
                            'label' => 'High',
                            'outcome' => 'high',
                            'stages' => [
                                ['year' => 2023, 'stage' => 'A', 'preferredPostMoneyValuation' => 1000000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmvDiscountPct' => 100, 'commonFmv' => 0, 'liquidityEvent' => false],
                                ['year' => 2025, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 1000000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 1000, 'liquidityEvent' => true],
                            ],
                        ],
                    ],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'exit-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2023-01-01',
                    'shareCount' => 1000,
                    'strike' => 0,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => -1, 'mediumPct' => 0, 'highPct' => 1],
            ]],
        ]))->toArray();

        $afterTax = $projection['jobs'][0]['afterTax']['lifetime']['totalValue'];

        $this->assertSame(100000.0 - FederalIncomeTax::regularTax(100000.0, 2025, false, 0.0, 100000.0), $afterTax['low']);
        $this->assertSame(500000.0 - FederalIncomeTax::regularTax(500000.0, 2025, false, 0.0, 500000.0), $afterTax['medium']);
        $this->assertSame(1000000.0 - FederalIncomeTax::regularTax(1000000.0, 2025, false, 0.0, 1000000.0), $afterTax['high']);
    }

    public function test_private_rsu_liquidity_is_taxed_as_ordinary_compensation(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2023,
            'horizonYears' => 3,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-rsu-exit',
                'name' => 'Private RSU exit',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [
                            ['year' => 2023, 'stage' => 'A', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => false],
                            ['year' => 2025, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 500000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 500, 'liquidityEvent' => true],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [[
                    'id' => 'rsu-exit',
                    'kind' => 'hire',
                    'grantDate' => '2023-01-01',
                    'shareCount' => 1000,
                    'vestingSchedule' => [
                        'type' => 'tranches',
                        'tranches' => [['month' => 0, 'percent' => 100]],
                    ],
                ]],
                'optionGrants' => [],
                'growthBands' => ['lowPct' => -1, 'mediumPct' => 0, 'highPct' => 1],
            ]],
        ]))->toArray();

        $job = $projection['jobs'][0];
        $afterTaxAnnual = $job['afterTax']['annual'][2];

        $this->assertSame(500000.0, $job['annual'][2]['shareSaleProceeds']);
        $this->assertSame(500000.0, $job['annual'][2]['privateRsuOrdinaryIncome']);
        $this->assertSame(0.0, $job['annual'][2]['equityCapitalGain']);
        $this->assertSame(500000.0, $afterTaxAnnual['taxableCompIncome']);
        $this->assertSame(0.0, $afterTaxAnnual['equityCapitalGain']);

        $sources = array_column($job['afterTax']['sources'], 'amount', 'sourceType');
        $this->assertSame(500000.0, $sources['equity_comp_rsu_ordinary_income']);
    }

    public function test_private_liquidity_basis_includes_pre_horizon_taxed_nso_bargain_element(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 1,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'pre-horizon-nso-exit',
                'name' => 'Pre horizon NSO exit',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [
                            ['year' => 2025, 'stage' => 'A', 'preferredPostMoneyValuation' => 10000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 10, 'liquidityEvent' => false],
                            ['year' => 2026, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => true],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'pre-horizon-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2025-01-01',
                    'shareCount' => 1000,
                    'strike' => 5,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $job = $projection['jobs'][0];

        $this->assertSame(100000.0, $job['annual'][0]['shareSaleProceeds']);
        $this->assertSame(10000.0, $job['annual'][0]['equitySaleBasis']);
        $this->assertSame(90000.0, $job['annual'][0]['equityCapitalGain']);
        $this->assertSame(0.0, $job['afterTax']['annual'][0]['nsoOrdinaryIncome']);
    }

    public function test_private_early_exercise_option_tax_uses_common_fmv_instead_of_preferred_share_price(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 1,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-early-exercise-option-job',
                'name' => 'Private early exercise option job',
                'company' => [
                    'type' => 'private',
                    'currentSharePrice' => 29.134,
                    'fourNineA' => 2.8,
                    'fullyDilutedShares' => 6178405,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [[
                            'year' => 2026,
                            'stage' => 'A',
                            'preferredPostMoneyValuation' => 180001651,
                            'capitalDilutionPct' => 0,
                            'employeePoolDilutionPct' => 0,
                            'commonFmv' => 2.8,
                            'liquidityEvent' => false,
                        ]],
                    ]],
                ],
                'comp' => ['baseSalary' => 280000.0, 'cashBonus' => 0.0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'iso-hire',
                    'kind' => 'hire',
                    'type' => 'iso',
                    'grantDate' => '2026-06-07',
                    'shareCount' => 61784.05,
                    'strike' => 2.8,
                    'cliffMonths' => 12,
                    'vestingYears' => 4,
                    'vestingFrequency' => 'monthly',
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $job = $projection['jobs'][0];
        $annual = $job['annual'][0];
        $afterTaxAnnual = $job['afterTax']['annual'][0];

        $this->assertSame(172995.34, $annual['exerciseOutlay']);
        $this->assertSame(107004.66, $annual['freeCashFlow']);
        $this->assertSame(280000.0, $afterTaxAnnual['taxableCompIncome']);
        $this->assertSame(0.0, $afterTaxAnnual['nsoOrdinaryIncome']);
        $this->assertSame(0.0, $afterTaxAnnual['isoAmtPreference']);
        $this->assertSame(0.0, $afterTaxAnnual['estimatedAmt']);
        $this->assertGreaterThan(0.0, $afterTaxAnnual['freeCashFlow']);
        $this->assertContains(
            'Private early exercise option job: ISO first-exercisable value exceeds $100k in 2026; spillover treated as NSO.',
            $projection['warnings'],
        );
    }

    public function test_private_paper_equity_uses_vested_ownership_and_compounded_dilution(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 2,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-paper-job',
                'name' => 'Private paper job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [
                            ['year' => 2026, 'stage' => 'A', 'preferredPostMoneyValuation' => 180000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 180, 'liquidityEvent' => false],
                            ['year' => 2027, 'stage' => 'B', 'preferredPostMoneyValuation' => 500000000, 'capitalDilutionPct' => 10, 'employeePoolDilutionPct' => 7, 'commonFmv' => 415, 'liquidityEvent' => false],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [[
                    'id' => 'rsu-paper',
                    'kind' => 'hire',
                    'grantDate' => '2025-01-01',
                    'shareCount' => 3000,
                    'cliffMonths' => 12,
                    'vestingYears' => 4,
                    'vestingFrequency' => 'annual',
                ]],
                'optionGrants' => [],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $points = $projection['jobs'][0]['paperEquity']['scenarios'][0]['points'];

        $this->assertSame(135000.0, $points[0]['grossOwnershipValue']);
        $this->assertSame(0.075, $points[0]['dilutedOwnershipPct']);
        $this->assertSame(622500.0, $points[1]['grossOwnershipValue']);
        $this->assertSame(0.1245, $points[1]['dilutedOwnershipPct']);
        $this->assertSame(622500.0, $projection['jobs'][0]['lifetime']['totalPaperEquityValue']['medium']);
    }

    public function test_private_paper_equity_applies_dilution_only_after_each_grant_date(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 3,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-future-grant-job',
                'name' => 'Private future grant job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [
                            ['year' => 2026, 'stage' => 'A', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => false],
                            ['year' => 2027, 'stage' => 'B', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 50, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => false],
                            ['year' => 2028, 'stage' => 'C', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => false],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [
                    [
                        'id' => 'current-option',
                        'kind' => 'hire',
                        'type' => 'nso',
                        'grantDate' => '2026-01-01',
                        'shareCount' => 1000,
                        'strike' => 0,
                        'vestingYears' => 1,
                        'earlyExercise83b' => true,
                    ],
                    [
                        'id' => 'future-option',
                        'kind' => 'refresh',
                        'type' => 'nso',
                        'grantDate' => '2028-01-01',
                        'shareCount' => 1000,
                        'strike' => 0,
                        'vestingYears' => 1,
                        'earlyExercise83b' => true,
                    ],
                ],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $point = $projection['jobs'][0]['paperEquity']['scenarios'][0]['points'][2];

        $this->assertSame(0.141668, $point['dilutedOwnershipPct']);
        $this->assertSame(141668.0, $point['grossOwnershipValue']);
        $this->assertSame(141668.0, $point['netPaperValue']);
    }

    public function test_private_paper_equity_includes_pre_horizon_owned_shares(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 1,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-pre-horizon-job',
                'name' => 'Private pre-horizon job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [[
                            'year' => 2026,
                            'stage' => 'A',
                            'preferredPostMoneyValuation' => 100000000,
                            'capitalDilutionPct' => 0,
                            'employeePoolDilutionPct' => 0,
                            'commonFmv' => 100,
                        ]],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'owned-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2025-01-01',
                    'shareCount' => 1000,
                    'strike' => 0,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $point = $projection['jobs'][0]['paperEquity']['scenarios'][0]['points'][0];

        $this->assertSame(0.1, $point['dilutedOwnershipPct']);
        $this->assertSame(100000.0, $point['grossOwnershipValue']);
        $this->assertSame(100000.0, $projection['jobs'][0]['lifetime']['totalPaperEquityValue']['medium']);
    }

    public function test_private_paper_equity_does_not_apply_first_future_stage_to_earlier_years(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 3,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-future-stage-job',
                'name' => 'Private future stage job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [[
                            'year' => 2028,
                            'stage' => 'Exit',
                            'preferredPostMoneyValuation' => 100000000,
                            'capitalDilutionPct' => 0,
                            'employeePoolDilutionPct' => 0,
                            'commonFmv' => 100,
                        ]],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'future-stage-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2026-01-01',
                    'shareCount' => 1000,
                    'strike' => 0,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $points = $projection['jobs'][0]['paperEquity']['scenarios'][0]['points'];

        $this->assertNull($points[0]['stage']);
        $this->assertSame(0.0, $points[0]['preferredPostMoneyValuation']);
        $this->assertSame(0.0, $points[0]['grossOwnershipValue']);
        $this->assertNull($points[1]['stage']);
        $this->assertSame(0.0, $points[1]['preferredPostMoneyValuation']);
        $this->assertSame(0.0, $points[1]['grossOwnershipValue']);
        $this->assertSame('Exit', $points[2]['stage']);
        $this->assertSame(100000.0, $points[2]['grossOwnershipValue']);
    }

    public function test_private_paper_equity_warns_when_multiple_scenarios_share_outcome(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 1,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-duplicate-outcome-job',
                'name' => 'Private duplicate outcome job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [
                        [
                            'id' => 'base',
                            'label' => 'Base',
                            'outcome' => 'medium',
                            'stages' => [[
                                'year' => 2026,
                                'stage' => 'A',
                                'preferredPostMoneyValuation' => 100000000,
                                'capitalDilutionPct' => 0,
                                'employeePoolDilutionPct' => 0,
                                'commonFmv' => 100,
                            ]],
                        ],
                        [
                            'id' => 'upside',
                            'label' => 'Upside',
                            'outcome' => 'medium',
                            'stages' => [[
                                'year' => 2026,
                                'stage' => 'A',
                                'preferredPostMoneyValuation' => 200000000,
                                'capitalDilutionPct' => 0,
                                'employeePoolDilutionPct' => 0,
                                'commonFmv' => 100,
                            ]],
                        ],
                    ],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'option-paper',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2026-01-01',
                    'shareCount' => 1000,
                    'strike' => 0,
                    'vestingYears' => 1,
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $this->assertContains(
            'Private duplicate outcome job: multiple medium private valuation scenarios; paper lifetime totals use the highest scenario for that outcome.',
            $projection['warnings'],
        );
        $this->assertSame(183334.0, $projection['jobs'][0]['lifetime']['totalPaperEquityValue']['medium']);
    }

    public function test_private_option_paper_equity_subtracts_exercise_cost_and_exposes_common_intrinsic_value(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 1,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-option-paper-job',
                'name' => 'Private option paper job',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'base',
                        'label' => 'Base',
                        'outcome' => 'medium',
                        'stages' => [[
                            'year' => 2026,
                            'stage' => 'A',
                            'preferredPostMoneyValuation' => 100000000,
                            'capitalDilutionPct' => 0,
                            'employeePoolDilutionPct' => 0,
                            'commonFmv' => 20,
                            'liquidityEvent' => false,
                        ]],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'iso-paper',
                    'kind' => 'hire',
                    'type' => 'iso',
                    'grantDate' => '2025-01-01',
                    'shareCount' => 1000,
                    'strike' => 5,
                    'cliffMonths' => 12,
                    'vestingYears' => 1,
                    'vestingFrequency' => 'annual',
                    'earlyExercise83b' => false,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $point = $projection['jobs'][0]['paperEquity']['scenarios'][0]['points'][0];

        $this->assertSame(100000.0, $point['grossOwnershipValue']);
        $this->assertSame(20000.0, $point['grossCommonValue']);
        $this->assertSame(15000.0, $point['commonIntrinsicValue']);
        $this->assertSame(5000.0, $point['exerciseCost']);
        $this->assertSame(95000.0, $point['netPaperValue']);
    }

    public function test_private_liquidity_event_freezes_before_delayed_early_exercise_vesting(): void
    {
        $projection = (new CareerCompCalculator)->project(CareerCompInputs::fromArray([
            'startYear' => 2026,
            'horizonYears' => 4,
            'currentJob' => null,
            'hypotheticalJobs' => [[
                'id' => 'private-fail-before-vesting',
                'name' => 'Private fail before vesting',
                'company' => [
                    'type' => 'private',
                    'fullyDilutedShares' => 1000000,
                    'valuationScenarios' => [[
                        'id' => 'fail',
                        'label' => 'Fail',
                        'outcome' => 'low',
                        'stages' => [
                            ['year' => 2026, 'stage' => 'A', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 10, 'liquidityEvent' => false],
                            ['year' => 2027, 'stage' => 'Exit', 'preferredPostMoneyValuation' => 100000000, 'capitalDilutionPct' => 0, 'employeePoolDilutionPct' => 0, 'commonFmv' => 100, 'liquidityEvent' => true],
                        ],
                    ]],
                ],
                'comp' => ['baseSalary' => 0, 'cashBonus' => 0],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'delayed-early-option',
                    'kind' => 'hire',
                    'type' => 'nso',
                    'grantDate' => '2026-01-01',
                    'vestingStartDate' => '2027-01-01',
                    'shareCount' => 1000,
                    'strike' => 10,
                    'cliffMonths' => 12,
                    'vestingYears' => 4,
                    'vestingFrequency' => 'monthly',
                    'earlyExercise83b' => true,
                ]],
                'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
            ]],
        ]))->toArray();

        $job = $projection['jobs'][0];
        $points = $job['paperEquity']['scenarios'][0]['points'];

        $this->assertSame(10000.0, $job['annual'][0]['exerciseOutlay']);
        $this->assertSame(0.0, $job['liquidity']['low'][1]['cumulativeValue']);
        $this->assertSame(0.0, $job['liquidity']['low'][2]['cumulativeValue']);
        $this->assertSame(0.0, $points[1]['grossOwnershipValue']);
        $this->assertSame(0.0, $points[2]['grossOwnershipValue']);
        $this->assertSame(0.0, $job['lifetime']['totalEquityValue']['low']);
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

        $this->assertSame(0.37, $annual['vestedLiquidEquity']);
        $this->assertSame(0.16, $annual['exerciseOutlay']);
        $this->assertSame(0.21, $annual['freeCashFlow']);
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
