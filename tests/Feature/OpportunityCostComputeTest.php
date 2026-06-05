<?php

namespace Tests\Feature;

use App\Services\Planning\OpportunityCost\OpportunityCostInputs;
use Tests\TestCase;

class OpportunityCostComputeTest extends TestCase
{
    public function test_opportunity_cost_page_is_public_and_escapes_initial_data(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning/opportunity-cost/s/%3Cimg%20src=x%20onerror=alert(1)%3E');

        $response->assertStatus(200);
        $response->assertSee('Opportunity Cost Planner');
        $response->assertSee('opportunity-cost-initial-data');
        $response->assertSee('\\u003Cimg src=x onerror=alert(1)\\u003E', false);
        $response->assertDontSee('<img src=x onerror=alert(1)>', false);
    }

    public function test_compute_endpoint_is_public(): void
    {
        $inputs = OpportunityCostInputs::defaults();
        $inputs['startYear'] = 2026;
        $inputs['currentJob']['rsuGrants'][0]['grantDate'] = '2026-01-01';
        $inputs['hypotheticalJobs'][0]['company']['liquidityDate'] = '2030-01-01';
        $inputs['hypotheticalJobs'][0]['optionGrants'][0]['grantDate'] = '2026-01-01';

        $response = $this->postJson('/api/financial-planning/opportunity-cost/compute', [
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
        $inputs = OpportunityCostInputs::defaults();
        $inputs['currentJob'] = null;

        $response = $this->postJson('/api/financial-planning/opportunity-cost/compute', [
            'inputs' => $inputs,
        ]);

        $response->assertOk();
        $response->assertJsonPath('currentJobId', null);
        $response->assertJsonPath('deltasVsCurrent', []);
        $response->assertJsonPath('jobs.0.id', 'hyp-1');
    }
}
