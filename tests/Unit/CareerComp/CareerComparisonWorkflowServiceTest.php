<?php

namespace Tests\Unit\CareerComp;

use App\Models\FinanceTool\FinEquityAwards;
use App\Models\User;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompInputs;
use Tests\TestCase;

/**
 * The workflow service is the consolidated, HTTP-agnostic entry point intended
 * for reuse from a future artisan command / CLI. These tests drive it directly,
 * with no request/session context, to lock in that reusability.
 */
class CareerComparisonWorkflowServiceTest extends TestCase
{
    private function service(): CareerComparisonWorkflowService
    {
        return $this->app->make(CareerComparisonWorkflowService::class);
    }

    public function test_create_workflow_persists_an_owned_active_workflow(): void
    {
        $user = User::factory()->create();
        $inputs = CareerCompInputs::fromArray(CareerCompInputs::defaults());

        $workflow = $this->service()->createWorkflow($user->id, $inputs, 'Offer vs current', false);

        $this->assertFalse($workflow->is_snapshot);
        $this->assertSame('Offer vs current', $workflow->title);
        $this->assertFalse($workflow->share_includes_current);
        $this->assertNotNull($workflow->last_active_at);
        $this->assertSame($user->id, $workflow->user_id);

        $reconstructed = $this->service()->inputsFromComparison($workflow)->toArray();
        $this->assertSame(CareerCompInputs::defaults()['startYear'], $reconstructed['startYear']);
        $this->assertNotNull($reconstructed['currentJob']);
    }

    public function test_create_snapshot_redacts_current_job_when_exclusive(): void
    {
        $user = User::factory()->create();
        $inputs = CareerCompInputs::fromArray(CareerCompInputs::defaults());

        $snapshot = $this->service()->createSnapshot($user->id, $inputs, false);

        $this->assertTrue($snapshot->is_snapshot);
        $this->assertNull($snapshot->current_job_id);
        $this->assertNull($snapshot->computed_json['currentJobId'] ?? null);
    }

    public function test_import_rsu_current_job_is_callable_without_request_context(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'CLI',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-01-01',
            'share_count' => 200,
            'symbol' => 'AAA',
            'grant_price' => 12,
            'vest_price' => null,
        ]);

        $result = $this->service()->importRsuCurrentJob($user->id, CareerCompInputs::defaults()['currentJob']);

        $this->assertCount(1, $result['importedGrants']);
        $this->assertSame(200, (int) $result['currentJob']['rsuGrants'][0]['shareCount']);
        $this->assertSame('rsu-tool-cli', $result['currentJob']['rsuGrants'][0]['id']);
    }

    public function test_import_rsu_returns_empty_when_user_has_no_awards(): void
    {
        $user = User::factory()->create();

        $result = $this->service()->importRsuCurrentJob($user->id, CareerCompInputs::defaults()['currentJob']);

        $this->assertSame([], $result['importedGrants']);
        $this->assertSame([], $result['currentJob']['rsuGrants']);
    }
}
