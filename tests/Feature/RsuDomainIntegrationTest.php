<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\FinanceTool\FinRsuVestSettlementAllocation;
use App\Models\FinanceTool\StockQuotesDaily;
use App\Models\User;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RsuDomainIntegrationTest extends TestCase
{
    public function test_rsu_write_hardening_preserves_missing_prices_allows_clears_and_fractional_shares(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/rsu', [[
            'award_id' => 'RSU-1',
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10.125,
            'symbol' => 'meta',
            'grant_price' => '',
            'vest_price' => 123.456789,
        ]])->assertOk();

        $award = FinEquityAwards::query()->firstOrFail();
        $this->assertSame('META', $award->symbol);
        $this->assertSame('10.125000', $award->share_count);
        $this->assertNull($award->grant_price);
        $this->assertSame('123.456789', $award->vest_price);
        $this->assertSame('manual', $award->vest_price_source);

        $this->actingAs($user)->postJson('/api/rsu', [[
            'award_id' => 'RSU-1',
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 11.5,
            'symbol' => 'META',
        ]])->assertOk();

        $award->refresh();
        $this->assertSame('11.500000', $award->share_count);
        $this->assertSame('123.456789', $award->vest_price);

        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-1',
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 11.5,
            'symbol' => 'META',
            'vest_price' => null,
            'clear_vest_price' => true,
        ]])->assertOk();

        $this->assertNull($award->refresh()->vest_price);
        $this->assertSame(1, FinEquityAwards::query()->where('uid', $user->id)->count());

        $otherUser = User::factory()->create();
        $this->actingAs($otherUser)->postJson('/api/rsu', [[
            'award_id' => 'RSU-1',
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 1,
            'symbol' => 'META',
        ]])->assertOk();

        $this->assertSame(2, FinEquityAwards::query()->count());
        $this->actingAs($otherUser)->deleteJson("/api/rsu/{$award->id}")->assertNotFound();
        $this->assertNotNull($award->refresh());
    }

    public function test_manual_rsu_validation_errors_return_unprocessable_entity(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/rsu', [[
            'award_id' => '',
            'grant_date' => 'not-a-date',
            'vest_date' => '2026-06-01',
            'share_count' => 0,
            'symbol' => 'TOO-LONG-INVALID-SYMBOL',
        ]])->assertUnprocessable();
    }

    public function test_quote_backfill_persists_missing_vest_price_without_overwriting_manual_price(): void
    {
        Carbon::setTestNow('2026-06-09');
        $user = User::factory()->create();
        $missing = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-2',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
        ]);
        $manual = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-3',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
            'vest_price' => 99,
            'vest_price_source' => 'manual',
        ]);
        StockQuotesDaily::query()->create(['c_symb' => 'META', 'c_date' => '2026-06-01', 'c_open' => 123.45, 'c_high' => 123.45, 'c_low' => 123.45, 'c_close' => 123.45, 'c_vol' => 0]);

        $this->actingAs($user)->getJson('/api/rsu')->assertOk();

        $this->assertSame('123.450000', $missing->refresh()->vest_price);
        $this->assertSame('quote_close', $missing->vest_price_source);
        $this->assertSame('99.000000', $manual->refresh()->vest_price);
        $this->assertSame('manual', $manual->vest_price_source);
        Carbon::setTestNow();
    }

    public function test_settlement_confirmation_allocates_withheld_shares_and_tax_facts(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-4',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-5',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $suggestions = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk();
        $this->assertSame(10.0, (float) $suggestions->json('0.grossShares'));
        $this->assertSame(1000.0, (float) $suggestions->json('0.grossIncome'));

        $settlementId = $suggestions->json('0.id');
        $this->assertNotNull($settlementId);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 275,
        ])->assertOk()->assertJsonPath('withheld_value', '300.0000')->assertJsonPath('excess_refund', '25.0000');

        $settlement = FinRsuVestSettlement::query()->findOrFail($settlementId);
        $this->assertSame('300.0000', $settlement->withheld_value);
        $this->assertSame('25.0000', $settlement->excess_refund);
        $this->assertCount(2, $settlement->allocations);
        $this->assertSame('1.800000', $settlement->allocations->first()->allocated_withheld_shares);

        $this->actingAs($user)->getJson('/api/rsu/tax-projection?year=2026')
            ->assertOk()
            ->assertJsonPath('ordinaryIncomeAtVest', 1000)
            ->assertJsonPath('withholdingValue', 300)
            ->assertJsonPath('actualTaxRemitted', 275)
            ->assertJsonPath('excessRefund', 25);
    }

    public function test_rsu_links_are_user_scoped_to_transactions_lots_and_payslips(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $settlement = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'confirmed',
        ]);

        $this->actingAs($other);
        $otherAccount = FinAccounts::query()->create(['acct_name' => 'Brokerage']);
        $otherTransaction = FinAccountLineItems::query()->create([
            't_account' => $otherAccount->acct_id,
            't_date' => '2026-06-01',
            't_amt' => 700,
            't_symbol' => 'META',
            't_qty' => 7,
        ]);
        $otherPayslip = FinPayslips::query()->create(['uid' => $other->id, 'pay_date' => '2026-06-15', 'earnings_rsu' => 1000]);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'share_deposit',
            'transaction_id' => $otherTransaction->t_id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'payslip_rsu_income',
            'payslip_id' => $otherPayslip->payslip_id,
        ])->assertNotFound();
    }

    public function test_settlement_confirmation_rejects_invalid_domain_values_and_other_user_targets(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-6',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 2.5,
            'actualTaxRemitted' => 100,
        ])->assertUnprocessable();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 11,
            'actualTaxRemitted' => 100,
        ])->assertUnprocessable();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 2,
            'actualTaxRemitted' => 250,
        ])->assertUnprocessable();

        $this->actingAs($other);
        $otherAccount = FinAccounts::query()->create(['acct_name' => 'Other Brokerage']);
        $otherPayslip = FinPayslips::query()->create(['pay_date' => '2026-06-15', 'earnings_rsu' => 1000]);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 2,
            'actualTaxRemitted' => 100,
            'brokerageAccountId' => $otherAccount->acct_id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 2,
            'actualTaxRemitted' => 100,
            'payslipId' => $otherPayslip->payslip_id,
        ])->assertNotFound();
    }

    public function test_rsu_links_validate_allocation_and_equity_award_scope(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-7',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $otherAward = FinEquityAwards::query()->create([
            'uid' => $other->id,
            'award_id' => 'RSU-7',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $settlement = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'confirmed',
        ]);
        $allocation = FinRsuVestSettlementAllocation::query()->create([
            'settlement_id' => $settlement->id,
            'equity_award_id' => $award->id,
            'vested_shares' => 10,
            'gross_income' => 1000,
            'allocation_ratio' => 1,
        ]);
        $secondAward = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-8',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 2,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $otherSettlement = FinRsuVestSettlement::query()->create([
            'uid' => $other->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'confirmed',
        ]);
        $otherAllocation = FinRsuVestSettlementAllocation::query()->create([
            'settlement_id' => $otherSettlement->id,
            'equity_award_id' => $otherAward->id,
            'vested_shares' => 10,
            'gross_income' => 1000,
            'allocation_ratio' => 1,
        ]);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $otherAllocation->id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'equity_award_id' => $otherAward->id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
            'equity_award_id' => $otherAward->id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
            'equity_award_id' => $secondAward->id,
        ])->assertUnprocessable();
    }
}
