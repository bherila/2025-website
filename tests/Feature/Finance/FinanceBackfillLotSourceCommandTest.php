<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceBackfillLotSourceCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_origin_mapping_updates_default_source_rows_even_when_legacy_lot_source_is_present(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $lot = $this->makeLot($account, [
            'lot_source' => 'analyzer',
            'lot_origin' => FinAccountLot::ORIGIN_MANUAL,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);

        $this->artisan('finance:backfill-lot-source --apply')
            ->assertSuccessful();

        $this->assertSame(FinAccountLot::SOURCE_MANUAL, $lot->refresh()->source);

        $this->artisan('finance:backfill-lot-source --apply')
            ->assertSuccessful();

        $this->assertSame(FinAccountLot::SOURCE_MANUAL, $lot->refresh()->source);
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => 'Brokerage '.fake()->unique()->numerify('####'),
            'acct_last_balance' => '0',
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => 1000,
            'cost_basis' => 900,
            'realized_gain_loss' => 100,
            'is_short_term' => false,
            'lot_source' => null,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
