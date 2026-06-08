<?php

namespace Tests\Unit\CareerComp;

use App\Models\CareerJob;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\User;
use App\Services\Planning\CareerComp\CareerComparisonWorkflowService;
use App\Services\Planning\CareerComp\CareerCompInputs;
use App\Services\Planning\CareerComp\JobSpec;
use App\Services\Planning\CareerComp\RsuVestingExpander;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The workflow service is the HTTP-agnostic entry point for the Career Comparison tool.
 * These tests drive it directly (no request/session context) to lock in the RSU-import
 * reconstruction accuracy and the owner-scoped orphan cleanup.
 */
class CareerComparisonWorkflowServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): CareerComparisonWorkflowService
    {
        return $this->app->make(CareerComparisonWorkflowService::class);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function award(int $userId, array $overrides = []): FinEquityAwards
    {
        return FinEquityAwards::query()->create(array_replace([
            'uid' => $userId,
            'award_id' => 'GRANT-1',
            'symbol' => 'AAA',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-01-01',
            'share_count' => 100,
            'grant_price' => null,
            'vest_price' => null,
        ], $overrides));
    }

    public function test_import_rsu_current_job_is_callable_without_request_context(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['award_id' => 'CLI', 'share_count' => 200, 'grant_price' => 12]);

        $result = $this->service()->importRsuCurrentJob($user->id, CareerCompInputs::defaults()['currentJob']);

        $this->assertCount(1, $result['importedGrants']);
        $this->assertSame(200.0, $result['currentJob']['rsuGrants'][0]['shareCount']);
        $this->assertSame('rsu-tool-cli', $result['currentJob']['rsuGrants'][0]['id']);
    }

    public function test_import_rsu_returns_empty_when_user_has_no_awards(): void
    {
        $user = User::factory()->create();

        $result = $this->service()->importRsuCurrentJob($user->id, CareerCompInputs::defaults()['currentJob']);

        $this->assertSame([], $result['importedGrants']);
        $this->assertSame([], $result['currentJob']['rsuGrants']);
    }

    public function test_cliff_and_vesting_years_are_inferred_from_grant_and_vest_dates(): void
    {
        $user = User::factory()->create();
        // Grant 2025-01-01, annual vests at +12/+24/+36 months → 1y cliff, 3y vesting, annual cadence.
        $this->award($user->id, ['vest_date' => '2026-01-01']);
        $this->award($user->id, ['vest_date' => '2027-01-01']);
        $this->award($user->id, ['vest_date' => '2028-01-01']);

        $grant = $this->service()->importRsuCurrentJob($user->id, null)['importedGrants'][0];

        $this->assertSame(12, $grant['cliffMonths']);
        $this->assertSame(3, $grant['vestingYears']);
        $this->assertSame('annual', $grant['vestingFrequency']);
        $this->assertSame(300.0, $grant['shareCount']);
        $this->assertSame(['2026-01-01', '2027-01-01', '2028-01-01'], array_column($grant['vestingEvents'], 'vestDate'));
    }

    public function test_quarterly_cadence_is_inferred_from_median_vest_gap(): void
    {
        $user = User::factory()->create();
        foreach (['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'] as $vestDate) {
            $this->award($user->id, ['vest_date' => $vestDate]);
        }

        $grant = $this->service()->importRsuCurrentJob($user->id, null)['importedGrants'][0];

        $this->assertSame('quarterly', $grant['vestingFrequency']);
        $this->assertSame(12, $grant['cliffMonths']);
    }

    public function test_monthly_cadence_is_inferred_from_median_vest_gap(): void
    {
        $user = User::factory()->create();
        foreach (['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'] as $vestDate) {
            $this->award($user->id, ['vest_date' => $vestDate]);
        }

        $grant = $this->service()->importRsuCurrentJob($user->id, null)['importedGrants'][0];

        $this->assertSame('monthly', $grant['vestingFrequency']);
    }

    public function test_short_post_cliff_import_keeps_actual_vesting_span(): void
    {
        $user = User::factory()->create();
        foreach (['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'] as $vestDate) {
            $this->award($user->id, [
                'grant_date' => '2025-12-01',
                'vest_date' => $vestDate,
            ]);
        }

        $result = $this->service()->importRsuCurrentJob($user->id, null);
        $grant = $result['importedGrants'][0];

        $this->assertSame(12, $grant['cliffMonths']);
        $this->assertSame(1.25, $grant['vestingYears']);
        $this->assertSame('monthly', $grant['vestingFrequency']);
        $this->assertSame(
            [2026 => 100.0, 2027 => 300.0],
            $this->sharesByYear((new RsuVestingExpander)->expand(JobSpec::nullableFromArray($result['currentJob'], true), 2026, 2)),
        );
    }

    public function test_sub_year_import_keeps_actual_vesting_span(): void
    {
        $user = User::factory()->create();
        foreach (['2026-04-15', '2026-07-15'] as $vestDate) {
            $this->award($user->id, [
                'grant_date' => '2026-01-15',
                'vest_date' => $vestDate,
            ]);
        }

        $result = $this->service()->importRsuCurrentJob($user->id, null);
        $grant = $result['importedGrants'][0];

        $this->assertSame(3, $grant['cliffMonths']);
        $this->assertSame(0.5, $grant['vestingYears']);
        $this->assertSame('quarterly', $grant['vestingFrequency']);
        $this->assertSame(
            [2026 => 200.0],
            $this->sharesByYear((new RsuVestingExpander)->expand(JobSpec::nullableFromArray($result['currentJob'], true), 2026, 2)),
        );
    }

    public function test_single_tranche_grant_defaults_to_annual_cadence(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['vest_date' => '2026-01-01']);

        $grant = $this->service()->importRsuCurrentJob($user->id, null)['importedGrants'][0];

        $this->assertSame('annual', $grant['vestingFrequency']);
    }

    public function test_current_share_price_prefers_latest_vest_price(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['vest_date' => '2026-01-01', 'grant_price' => 12, 'vest_price' => 90]);
        $this->award($user->id, ['vest_date' => '2026-07-01', 'grant_price' => 12, 'vest_price' => 110]);

        $result = $this->service()->importRsuCurrentJob($user->id, null);

        $this->assertSame(110.0, $result['currentJob']['company']['currentSharePrice']);
    }

    public function test_current_share_price_falls_back_to_grant_price(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['grant_date' => '2024-01-01', 'vest_date' => '2025-01-01', 'grant_price' => 30]);
        $this->award($user->id, ['grant_date' => '2025-01-01', 'vest_date' => '2026-01-01', 'grant_price' => 45]);

        $result = $this->service()->importRsuCurrentJob($user->id, null);

        $this->assertSame(45.0, $result['currentJob']['company']['currentSharePrice']);
    }

    public function test_default_current_share_price_is_replaced_by_imported_price(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['vest_price' => 110]);

        $base = JobSpec::defaults(true);
        $base['company']['currentSharePrice'] = 25.0;

        $result = $this->service()->importRsuCurrentJob($user->id, $base);

        $this->assertSame(110.0, $result['currentJob']['company']['currentSharePrice']);
    }

    public function test_existing_positive_current_share_price_is_not_overwritten(): void
    {
        $user = User::factory()->create();
        $this->award($user->id, ['vest_price' => 110]);

        $base = JobSpec::defaults(true);
        $base['company']['currentSharePrice'] = 80.0;

        $result = $this->service()->importRsuCurrentJob($user->id, $base);

        $this->assertSame(80.0, $result['currentJob']['company']['currentSharePrice']);
    }

    public function test_orphan_cleanup_is_scoped_to_the_owner(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->service()->saveLatest($userA->id, $this->latestInputs('A v1'));
        $this->service()->saveLatest($userB->id, $this->latestInputs('B'));

        $bJobIds = CareerJob::query()->where('user_id', $userB->id)->pluck('id')->all();
        $aStaleJobIds = CareerJob::query()->where('user_id', $userA->id)->pluck('id')->all();

        // Re-saving A's latest with fresh specs orphans A's original jobs.
        $this->service()->saveLatest($userA->id, $this->latestInputs('A v2'));

        $this->assertSame(
            0,
            CareerJob::query()->whereIn('id', $aStaleJobIds)->count(),
            "User A's superseded jobs should be pruned",
        );
        $this->assertSame(
            count($bJobIds),
            CareerJob::query()->whereIn('id', $bJobIds)->count(),
            "User B's jobs must survive cleanup triggered by user A",
        );
    }

    private function latestInputs(string $tag): CareerCompInputs
    {
        $defaults = CareerCompInputs::defaults();
        $current = $defaults['currentJob'];
        $current['name'] = "Current {$tag}";
        $hypothetical = $defaults['hypotheticalJobs'][0];
        $hypothetical['name'] = "Offer {$tag}";

        return CareerCompInputs::fromArray(array_replace($defaults, [
            'currentJob' => $current,
            'hypotheticalJobs' => [$hypothetical],
        ]));
    }

    /**
     * @param  list<array{year:int,vestedShares:float}>  $rows
     * @return array<int, float>
     */
    private function sharesByYear(array $rows): array
    {
        $shares = [];
        foreach ($rows as $row) {
            $shares[$row['year']] = ($shares[$row['year']] ?? 0.0) + $row['vestedShares'];
        }

        ksort($shares);

        return $shares;
    }
}
