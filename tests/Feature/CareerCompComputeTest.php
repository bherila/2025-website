<?php

namespace Tests\Feature;

use App\Services\Planning\CareerComp\CareerCompInputs;
use Tests\TestCase;

class CareerCompComputeTest extends TestCase
{
    public function test_career_comparison_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning/career-comparison');

        $response->assertStatus(200);
        $response->assertSee('Career Comparison');
        $response->assertSee('career-comparison-initial-data');
    }

    public function test_compute_endpoint_is_public(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['startYear'] = 2026;
        $inputs['currentJob']['rsuGrants'][0]['grantDate'] = '2026-01-01';
        $inputs['hypotheticalJobs'][0]['company']['liquidityDate'] = '2030-01-01';
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['grantDate'] = '2026-01-01';

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('startYear', 2026);
        $response->assertJsonPath('jobs.0.id', 'current');
        $response->assertJsonPath('jobs.1.id', 'hyp-1');
        $response->assertJsonPath('deltasVsCurrent.0.jobId', 'hyp-1');
    }

    public function test_compute_endpoint_accepts_empty_current_job(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('currentJobId', null);
        $response->assertJsonPath('deltasVsCurrent', []);
        $response->assertJsonPath('jobs.0.id', 'hyp-1');
    }

    public function test_compute_endpoint_preserves_legacy_current_job_clearing(): void
    {
        $inputs = CareerCompInputs::defaults();
        unset($inputs['currentJobs'][0]['notesMarkdown'], $inputs['currentJobs'][0]['archived']);
        $inputs['currentJob'] = null;

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('currentJobId', null);
        $response->assertJsonPath('jobs.0.id', 'hyp-1');
    }

    public function test_compute_endpoint_honors_legacy_current_job_edit_when_frontend_current_jobs_matches_defaults(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob']['name'] = 'Edited current role';

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.name', 'Edited current role');
    }

    public function test_compute_endpoint_excludes_archived_hypothetical_jobs(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['hypotheticalJobs'] = [
            $this->cashOnlyJob('active-offer', 'Active offer', 100000),
            [
                ...$this->cashOnlyJob('archived-offer', 'Archived offer', 999999),
                'archived' => true,
                'notesMarkdown' => "# No early exercise\n\nExercise cost is too high.",
            ],
        ];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonCount(1, 'jobs');
        $response->assertJsonPath('jobs.0.id', 'active-offer');
        $response->assertJsonPath('deltasVsCurrent', []);
    }

    public function test_compute_endpoint_preserves_raise_and_refresher_inputs(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 3,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Public offer',
                    'company' => ['type' => 'public', 'currentSharePrice' => 100],
                    'comp' => ['baseSalary' => 100000, 'cashBonus' => 0, 'annualRaisePct' => 10],
                    'refresher' => [
                        'pctOfBase' => 100,
                        'cadenceYears' => 10,
                        'firstYearOffset' => 1,
                        'vestingYears' => 1,
                        'cliffMonths' => 0,
                        'vestingFrequency' => 'annual',
                    ],
                    'rsuGrants' => [],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 100, 'highPct' => 200],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.annual.1.salary', 110000);
        $response->assertJsonPath('jobs.0.lifetime.totalEquityValue.medium', 220000);
    }

    public function test_compute_endpoint_prorates_first_year_cash_comp_from_job_start_date(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 2,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Midyear offer',
                    'startDate' => '2026-07-01',
                    'company' => ['type' => 'public', 'currentSharePrice' => 0],
                    'comp' => ['baseSalary' => 36500, 'cashBonus' => 3650, 'annualRaisePct' => 0],
                    'rsuGrants' => [],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 1, 'highPct' => 2],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.annual.0.salary', 18400);
        $response->assertJsonPath('jobs.0.annual.0.bonus', 1840);
        $response->assertJsonPath('jobs.0.annual.1.salary', 36500);
        $response->assertJsonPath('jobs.0.annual.1.bonus', 3650);
        $response->assertJsonPath('jobs.0.lifetime.totalCashComp', 60390);
    }

    public function test_compute_endpoint_starts_raises_from_job_start_year(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 4,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Future offer',
                    'startDate' => '2028-01-01',
                    'company' => ['type' => 'public', 'currentSharePrice' => 0],
                    'comp' => ['baseSalary' => 100000, 'cashBonus' => 10000, 'annualRaisePct' => 10],
                    'rsuGrants' => [],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 1, 'highPct' => 2],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.annual.0.salary', 0);
        $response->assertJsonPath('jobs.0.annual.1.salary', 0);
        $response->assertJsonPath('jobs.0.annual.2.salary', 100000);
        $response->assertJsonPath('jobs.0.annual.3.salary', 110000);
        $response->assertJsonPath('jobs.0.annual.2.bonus', 10000);
        $response->assertJsonPath('jobs.0.annual.3.bonus', 11000);
    }

    public function test_compute_endpoint_applies_transition_assumptions_before_future_offer(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 2,
                'startYear' => 2026,
                'currentJob' => $this->cashOnlyJob('current', 'Current job', 100000),
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('hyp-1', 'Future offer', 200000),
                    'startDate' => '2027-01-01',
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.1.annual.0.salary', 100000);
        $response->assertJsonPath('jobs.1.annual.1.salary', 200000);
        $response->assertJsonPath('jobs.1.lifetime.totalCashComp', 300000);
        $response->assertJsonPath('deltasVsCurrent.0.cashCompDelta', 100000);
    }

    public function test_compute_endpoint_aggregates_multiple_current_jobs_and_retains_selected_current_jobs_per_offer(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 2,
                'startYear' => 2026,
                'currentJobs' => [
                    $this->cashOnlyJob('current-main', 'Main job', 100000),
                    $this->cashOnlyJob('current-side', 'Side job', 20000),
                ],
                'hypotheticalJobs' => [
                    [
                        ...$this->cashOnlyJob('offer-retain-side', 'Offer retaining side role', 150000),
                        'startDate' => '2027-01-01',
                        'retainedCurrentJobIds' => ['current-side'],
                    ],
                    [
                        ...$this->cashOnlyJob('offer-quit-all', 'Offer quitting all current roles', 150000),
                        'startDate' => '2027-01-01',
                    ],
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('currentJobId', 'current-baseline');
        $response->assertJsonPath('currentJobIds', ['current-main', 'current-side']);
        $response->assertJsonPath('jobs.0.id', 'current-baseline');
        $response->assertJsonPath('jobs.0.isCurrent', true);
        $response->assertJsonPath('jobs.0.annual.0.salary', 120000);
        $response->assertJsonPath('jobs.0.annual.1.salary', 120000);
        $response->assertJsonPath('jobs.1.retainedCurrentJobIds', ['current-side']);
        $response->assertJsonPath('jobs.1.quitCurrentJobIds', ['current-main']);
        $response->assertJsonPath('jobs.1.annual.0.salary', 120000);
        $response->assertJsonPath('jobs.1.annual.1.salary', 170000);
        $response->assertJsonPath('jobs.1.lifetime.totalCashComp', 290000);
        $response->assertJsonPath('jobs.2.retainedCurrentJobIds', []);
        $response->assertJsonPath('jobs.2.quitCurrentJobIds', ['current-main', 'current-side']);
        $response->assertJsonPath('jobs.2.annual.0.salary', 120000);
        $response->assertJsonPath('jobs.2.annual.1.salary', 150000);
        $response->assertJsonPath('jobs.2.lifetime.totalCashComp', 270000);
        $response->assertJsonPath('deltasVsCurrent.0.cashCompDelta', 50000);
        $response->assertJsonPath('deltasVsCurrent.1.cashCompDelta', 30000);
    }

    public function test_compute_endpoint_transition_override_cuts_off_current_job_vesting(): void
    {
        $currentJob = $this->cashOnlyJob('current', 'Current job', 0);
        $currentJob['company']['currentSharePrice'] = 10;
        $currentJob['rsuGrants'] = [[
            'id' => 'current-rsu',
            'kind' => 'hire',
            'grantDate' => '2026-01-01',
            'shareCount' => 120,
            'cliffMonths' => 0,
            'vestingYears' => 1,
            'vestingFrequency' => 'monthly',
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2026,
                'currentJob' => $currentJob,
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('hyp-1', 'Midyear offer', 0),
                    'startDate' => '2026-07-01',
                    'transitionOverride' => [
                        'currentJobNoticeWeeks' => 0,
                        'timeOffBetweenJobsWeeks' => 0,
                    ],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.1.annual.0.vestedLiquidEquity', 500);
        $response->assertJsonPath('jobs.1.lifetime.totalEquityValue.medium', 500);
    }

    public function test_compute_endpoint_ignores_prior_resignation_date_when_offer_has_no_start_date(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2026,
                'currentJob' => $this->cashOnlyJob('current', 'Current job', 100000),
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('hyp-1', 'Offer without start date', 200000),
                    'priorJobResignationDate' => '2026-06-01',
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.1.annual.0.salary', 200000);
        $response->assertJsonPath('jobs.1.lifetime.totalCashComp', 200000);
        $response->assertJsonPath('deltasVsCurrent.0.cashCompDelta', 100000);
    }

    public function test_compute_endpoint_keeps_projection_raise_offset_for_past_start_dates(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 2,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Existing role',
                    'startDate' => '2020-01-01',
                    'company' => ['type' => 'public', 'currentSharePrice' => 0],
                    'comp' => ['baseSalary' => 100000, 'cashBonus' => 10000, 'annualRaisePct' => 10],
                    'rsuGrants' => [],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 1, 'highPct' => 2],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.annual.0.salary', 100000);
        $response->assertJsonPath('jobs.0.annual.0.bonus', 10000);
        $response->assertJsonPath('jobs.0.annual.1.salary', 110000);
        $response->assertJsonPath('jobs.0.annual.1.bonus', 11000);
    }

    public function test_compute_endpoint_anchors_projected_refreshers_to_job_start_year(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 4,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Future refresher offer',
                    'startDate' => '2028-01-01',
                    'company' => ['type' => 'public', 'currentSharePrice' => 100],
                    'comp' => ['baseSalary' => 100000, 'cashBonus' => 0, 'annualRaisePct' => 10],
                    'refresher' => [
                        'pctOfBase' => 100,
                        'cadenceYears' => 10,
                        'firstYearOffset' => 1,
                        'vestingYears' => 1,
                        'cliffMonths' => 0,
                        'vestingFrequency' => 'monthly',
                    ],
                    'rsuGrants' => [],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
                ]],
            ],
        ]);

        $response->assertOk();

        $refresherRows = collect($response->json('jobs.0.vesting'))
            ->filter(fn (array $row): bool => str_contains((string) $row['grantId'], '-refresher-'))
            ->values();

        $this->assertSame(['hyp-1-refresher-2029'], $refresherRows->pluck('grantId')->all());
        $this->assertSame([2029], $refresherRows->pluck('year')->all());
    }

    public function test_compute_endpoint_rejects_zero_refresher_vesting_years(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['hypotheticalJobs'][0]['refresher']['pctOfBase'] = 100;
        $inputs['hypotheticalJobs'][0]['refresher']['vestingYears'] = 0;

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['inputs.hypotheticalJobs.0.refresher.vestingYears']);
    }

    public function test_compute_endpoint_rejects_refresher_cliff_longer_than_vesting(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['hypotheticalJobs'][0]['refresher']['pctOfBase'] = 100;
        $inputs['hypotheticalJobs'][0]['refresher']['vestingYears'] = 0.25;
        $inputs['hypotheticalJobs'][0]['refresher']['cliffMonths'] = 12;

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['inputs.hypotheticalJobs.0.refresher.cliffMonths']);
    }

    public function test_public_company_validates_without_private_only_fields(): void
    {
        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 5,
                'startYear' => 2026,
                'currentJob' => null,
                'hypotheticalJobs' => [[
                    'id' => 'hyp-1',
                    'name' => 'Public offer',
                    'company' => ['type' => 'public', 'currentSharePrice' => 50],
                    'comp' => ['baseSalary' => 200000, 'cashBonus' => 0],
                    'rsuGrants' => [[
                        'id' => 'r1', 'kind' => 'hire', 'grantDate' => '2026-01-01',
                        'shareCount' => 400, 'cliffMonths' => 12, 'vestingYears' => 4,
                        'vestingFrequency' => 'quarterly',
                    ]],
                    'optionGrants' => [],
                    'growthBands' => ['lowPct' => 0, 'mediumPct' => 5, 'highPct' => 10],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.id', 'hyp-1');
    }

    public function test_compute_rejects_invalid_vesting_frequency(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['hypotheticalJobs'][0]['rsuGrants'] = [[
            'id' => 'r1', 'kind' => 'hire', 'grantDate' => '2026-01-01',
            'shareCount' => 100, 'cliffMonths' => 0, 'vestingYears' => 1,
            'vestingFrequency' => 'weekly',
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['inputs.hypotheticalJobs.0.rsuGrants.0.vestingFrequency']);
    }

    public function test_compute_accepts_delayed_option_vesting_start_and_tranche_schedule(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['startYear'] = 2026;
        $inputs['horizonYears'] = 6;
        $inputs['hypotheticalJobs'][0]['optionGrants'] = [[
            'id' => 'delayed-iso',
            'kind' => 'hire',
            'type' => 'iso',
            'grantDate' => '2026-08-17',
            'vestingStartDate' => '2027-08-17',
            'shareCount' => 1000,
            'strike' => 2.8,
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
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.vesting.0.year', 2028);
        $response->assertJsonPath('jobs.0.vesting.0.vestedShares', 400);
    }

    public function test_compute_accepts_private_valuation_scenarios_and_returns_paper_equity(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['startYear'] = 2026;
        $inputs['horizonYears'] = 1;
        $inputs['hypotheticalJobs'][0]['company']['fullyDilutedShares'] = 1000000;
        $inputs['hypotheticalJobs'][0]['company']['valuationScenarios'] = [[
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
                'commonFmvDiscountPct' => 0,
                'liquidityEvent' => false,
            ]],
        ]];
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['grantDate'] = '2025-01-01';
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['shareCount'] = 1000;
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['strike'] = 5;
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['vestingYears'] = 1;
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['vestingFrequency'] = 'annual';

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.paperEquity.scenarios.0.id', 'base');
        $response->assertJsonPath('jobs.0.paperEquity.scenarios.0.points.0.netPaperValue', 95000);
        $response->assertJsonPath('jobs.0.lifetime.totalPaperEquityValue.medium', 95000);
    }

    public function test_compute_endpoint_carries_prior_current_private_paper_equity_into_future_offer(): void
    {
        $currentJob = $this->cashOnlyJob('current', 'Current private', 0);
        $currentJob['company']['type'] = 'private';
        $currentJob['company']['fullyDilutedShares'] = 1000000;
        $currentJob['company']['valuationScenarios'] = [[
            'id' => 'current-base',
            'label' => 'Current base',
            'outcome' => 'medium',
            'stages' => [[
                'year' => 2026,
                'stage' => 'A',
                'preferredPostMoneyValuation' => 100000000,
                'capitalDilutionPct' => 0,
                'employeePoolDilutionPct' => 0,
                'commonFmv' => 20,
                'commonFmvDiscountPct' => 0,
                'liquidityEvent' => false,
            ]],
        ]];
        $currentJob['optionGrants'] = [[
            'id' => 'current-option',
            'kind' => 'hire',
            'type' => 'nso',
            'grantDate' => '2025-01-01',
            'shareCount' => 1000,
            'strike' => 5,
            'cliffMonths' => 0,
            'vestingYears' => 1,
            'vestingFrequency' => 'annual',
            'earlyExercise83b' => false,
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2026,
                'currentJob' => $currentJob,
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('hyp-1', 'Future public offer', 0),
                    'startDate' => '2027-01-01',
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.1.lifetime.totalEquityValue.medium', 0);
        $response->assertJsonPath('jobs.1.lifetime.totalPaperEquityValue.medium', 95000);
        $response->assertJsonPath('jobs.1.paperEquity.totalsByOutcome.medium', 95000);
    }

    public function test_compute_uses_explicit_rsu_vest_dates_for_future_resignation_cutoffs(): void
    {
        $currentJob = $this->cashOnlyJob('current', 'Current job', 0);
        $currentJob['company']['currentSharePrice'] = 593;
        $currentJob['rsuGrants'] = [[
            'id' => 'current-rsu-explicit',
            'kind' => 'hire',
            'grantDate' => '2025-02-15',
            'shareCount' => 568,
            'grantPrice' => 500,
            'cliffMonths' => 0,
            'vestingYears' => 4,
            'vestingFrequency' => 'quarterly',
            'vestingEvents' => [[
                'vestDate' => '2027-02-15',
                'shareCount' => 568,
                'sourceAwardId' => 'RSU-2027',
                'sourceAwardRowId' => 123,
                'symbol' => 'TEST',
                'grantPrice' => 500,
                'vestPrice' => 593,
            ]],
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2027,
                'currentJob' => $currentJob,
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('hyp-1', 'Future offer', 100000),
                    'startDate' => '2027-03-01',
                    'priorJobResignationDate' => '2027-02-16',
                    'transitionOverride' => [
                        'currentJobNoticeWeeks' => 0,
                        'timeOffBetweenJobsWeeks' => 0,
                    ],
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.1.annual.0.shareSaleProceeds', 336824);
        $response->assertJsonPath('jobs.1.vesting.0.vestedShares', 568);
    }

    public function test_compute_applies_explicit_rsu_active_through_boundaries(): void
    {
        foreach ([
            '2027-02-15' => 0,
            '2027-02-16' => 1000,
            '2027-02-17' => 1000,
        ] as $resignationDate => $expectedProceeds) {
            $currentJob = $this->cashOnlyJob('current', 'Current job', 0);
            $currentJob['company']['currentSharePrice'] = 10;
            $currentJob['rsuGrants'] = [[
                'id' => 'current-rsu-explicit',
                'kind' => 'hire',
                'grantDate' => '2026-01-01',
                'shareCount' => 100,
                'cliffMonths' => 0,
                'vestingYears' => 1,
                'vestingFrequency' => 'monthly',
                'vestingEvents' => [[
                    'vestDate' => '2027-02-15',
                    'shareCount' => 100,
                ]],
            ]];

            $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
                'inputs' => [
                    'horizonYears' => 1,
                    'startYear' => 2027,
                    'currentJob' => $currentJob,
                    'hypotheticalJobs' => [[
                        ...$this->cashOnlyJob('hyp-1', 'Future offer', 0),
                        'startDate' => '2027-03-01',
                        'priorJobResignationDate' => $resignationDate,
                        'transitionOverride' => [
                            'currentJobNoticeWeeks' => 0,
                            'timeOffBetweenJobsWeeks' => 0,
                        ],
                    ]],
                ],
            ]);

            $response->assertOk();
            $this->assertSame($expectedProceeds, $response->json('jobs.1.annual.0.shareSaleProceeds'), "Resignation {$resignationDate}");
        }
    }

    public function test_compute_keeps_synthetic_rsu_vesting_for_manual_grants(): void
    {
        $currentJob = $this->cashOnlyJob('current', 'Current job', 0);
        $currentJob['company']['currentSharePrice'] = 10;
        $currentJob['rsuGrants'] = [[
            'id' => 'manual-rsu',
            'kind' => 'hire',
            'grantDate' => '2027-01-01',
            'shareCount' => 120,
            'cliffMonths' => 0,
            'vestingYears' => 1,
            'vestingFrequency' => 'monthly',
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2027,
                'currentJob' => $currentJob,
                'currentJobs' => [$currentJob],
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('archived-offer', 'Archived offer', 0),
                    'archived' => true,
                ]],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('jobs.0.annual.0.shareSaleProceeds', 1100);
        $response->assertJsonPath('jobs.0.vesting.0.vestedShares', 110);
    }

    public function test_combined_job_suppresses_component_negative_cash_flow_warning_when_combined_cash_flow_is_positive(): void
    {
        $startupComponent = $this->cashOnlyJob('startup-component', 'Startup component', 100000);
        $startupComponent['optionGrants'] = [[
            'id' => 'startup-options',
            'kind' => 'hire',
            'type' => 'nso',
            'grantDate' => '2027-01-01',
            'shareCount' => 12000,
            'strike' => 50,
            'cliffMonths' => 0,
            'vestingYears' => 1,
            'vestingFrequency' => 'monthly',
            'earlyExercise83b' => false,
        ]];
        $cashComponent = $this->cashOnlyJob('cash-component', 'Cash component', 500000);
        $startupComponent['growthBands'] = ['lowPct' => -10, 'mediumPct' => 0, 'highPct' => 10];
        $cashComponent['growthBands'] = ['lowPct' => -10, 'mediumPct' => 0, 'highPct' => 10];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => [
                'horizonYears' => 1,
                'startYear' => 2027,
                'currentJob' => $startupComponent,
                'currentJobs' => [$startupComponent, $cashComponent],
                'hypotheticalJobs' => [[
                    ...$this->cashOnlyJob('archived-offer', 'Archived offer', 0),
                    'archived' => true,
                ]],
            ],
        ]);

        $response->assertOk();
        $this->assertGreaterThan(0, $response->json('jobs.0.annual.0.freeCashFlow'));
        $this->assertSame([], $response->json('warnings'));
    }

    public function test_compute_rejects_invalid_private_valuation_scenario_rows(): void
    {
        $inputs = CareerCompInputs::defaults();
        $inputs['currentJob'] = null;
        $inputs['hypotheticalJobs'][0]['company']['valuationScenarios'] = [[
            'id' => 'base',
            'label' => 'Base',
            'outcome' => 'moonshot',
            'stages' => [[
                'year' => 2026,
                'preferredPostMoneyValuation' => -1,
            ]],
        ]];

        $response = $this->postJson('/api/financial-planning/career-comparison/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors([
            'inputs.hypotheticalJobs.0.company.valuationScenarios.0.outcome',
            'inputs.hypotheticalJobs.0.company.valuationScenarios.0.stages.0.preferredPostMoneyValuation',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function cashOnlyJob(string $id, string $name, float $baseSalary): array
    {
        return [
            'id' => $id,
            'name' => $name,
            'company' => ['type' => 'public', 'currentSharePrice' => 0],
            'comp' => ['baseSalary' => $baseSalary, 'cashBonus' => 0, 'annualRaisePct' => 0],
            'rsuGrants' => [],
            'optionGrants' => [],
            'growthBands' => ['lowPct' => 0, 'mediumPct' => 0, 'highPct' => 0],
        ];
    }
}
