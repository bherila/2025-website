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
}
