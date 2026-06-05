<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use App\Services\Finance\FeeAnalyticsService;
use App\Services\Finance\MoneyMath;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceSummaryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_summary_total_fee_counts_transaction_amount_fee_rows_and_matches_fee_analytics(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user);

        $this->createLineItem($account, [
            't_date' => '2024-12-15',
            't_type' => 'Fee',
            't_amt' => -999,
        ]);
        $this->createLineItem($account, [
            't_date' => '2025-01-15',
            't_type' => 'Fee',
            't_amt' => -125.25,
        ]);
        $this->createLineItem($account, [
            't_date' => '2025-02-15',
            't_type' => 'Management Fee',
            't_amt' => 25.25,
        ]);

        $expected = app(FeeAnalyticsService::class)->actualFeesForAccount($account, 2025, false)['total'];

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/summary?year=2025");

        $response->assertOk();
        $this->assertSame(100.0, $expected);
        $this->assertSame($expected, (float) $response->json('totals.total_fee'));
    }

    public function test_summary_total_fee_counts_embedded_fee_rows_and_keeps_other_totals(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user);

        $this->createLineItem($account, [
            't_type' => 'Buy',
            't_amt' => -1000,
            't_commission' => 1.25,
            't_fee' => 7.5,
        ]);
        $this->createLineItem($account, [
            't_type' => 'Sell',
            't_amt' => 1200,
            't_commission' => 2,
            't_fee' => 2.5,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/summary?year=2025");

        $response->assertOk();
        $this->assertSame(2200.0, (float) $response->json('totals.total_volume'));
        $this->assertSame(3.25, (float) $response->json('totals.total_commission'));
        $this->assertSame(10.0, (float) $response->json('totals.total_fee'));
    }

    public function test_summary_year_all_sums_distinct_transaction_years_using_fee_analytics(): void
    {
        $user = User::factory()->create();
        $account = $this->createAccount($user);

        $this->createLineItem($account, [
            't_date' => '2024-06-15',
            't_type' => 'Fee',
            't_amt' => -12,
        ]);
        $this->createLineItem($account, [
            't_date' => '2025-06-15',
            't_type' => 'Fee',
            't_amt' => -34,
        ]);
        $this->createLineItem($account, [
            't_date' => '2025-07-15',
            't_type' => 'Fee',
            't_amt' => 4,
        ]);
        $this->createLineItem($account, [
            't_date' => '2026-06-15',
            't_type' => 'Buy',
            't_amt' => -100,
            't_fee' => -3,
        ]);

        $feeAnalytics = app(FeeAnalyticsService::class);
        $expected = array_reduce(
            [2024, 2025, 2026],
            static fn (float $total, int $year): float => MoneyMath::add(
                $total,
                $feeAnalytics->actualFeesForAccount($account, $year, false)['total'],
            ),
            0.0,
        );

        $allResponse = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/summary?year=all");
        $defaultResponse = $this->actingAs($user)->getJson("/api/finance/{$account->acct_id}/summary");

        $allResponse->assertOk();
        $defaultResponse->assertOk();
        $this->assertSame(39.0, $expected);
        $this->assertSame($expected, (float) $allResponse->json('totals.total_fee'));
        $this->assertSame($expected, (float) $defaultResponse->json('totals.total_fee'));
    }

    public function test_summary_requires_auth_and_scopes_accounts_to_owner(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -40]);

        $this->getJson("/api/finance/{$account->acct_id}/summary?year=2025")
            ->assertUnauthorized();

        $this->actingAs($otherUser)
            ->getJson("/api/finance/{$account->acct_id}/summary?year=2025")
            ->assertNotFound();

        $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/summary?year=2025")
            ->assertOk()
            ->assertJsonStructure([
                'totals' => ['total_volume', 'total_commission', 'total_fee'],
                'symbolSummary',
                'monthSummary',
            ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createAccount(User $user, array $overrides = []): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate(array_merge([
            'acct_owner' => $user->id,
            'acct_name' => fake()->unique()->word(),
            'acct_last_balance' => '10000',
        ], $overrides)));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createLineItem(FinAccounts $account, array $overrides = []): FinAccountLineItems
    {
        return FinAccountLineItems::forceCreate(array_merge([
            't_account' => $account->acct_id,
            't_date' => '2025-01-15',
            't_type' => 'Fee',
            't_amt' => -10,
            't_commission' => 0,
            't_fee' => 0,
            't_description' => 'Fee row',
        ], $overrides));
    }
}
