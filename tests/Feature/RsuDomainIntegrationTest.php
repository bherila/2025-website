<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuLink;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\FinanceTool\FinRsuVestSettlementAllocation;
use App\Models\FinanceTool\StockQuotesDaily;
use App\Models\User;
use App\Models\UserFeaturePermission;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RsuDomainIntegrationTest extends TestCase
{
    private function grantRsuManage(User $user): void
    {
        UserFeaturePermission::query()->firstOrCreate([
            'user_id' => $user->id,
            'permission' => 'finance.rsu.manage',
        ]);
    }

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
        $this->assertSame(10.125, $award->share_count);
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
        $this->assertSame(11.5, $award->share_count);
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
        $this->grantRsuManage($otherUser);
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

    public function test_settlement_link_status_null_is_rejected(): void
    {
        $user = User::factory()->create();
        $settlement = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'confirmed',
        ]);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'status' => null,
        ])->assertUnprocessable();
    }

    public function test_confirmed_settlement_is_not_resuggested(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-DEDUP',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json('0.id');
        $this->assertNotNull($settlementId);

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 250,
        ])->assertOk();

        $second = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk();

        $this->assertCount(0, $second->json());
        $this->assertSame(1, FinRsuVestSettlement::query()->where('uid', $user->id)->count());
    }

    public function test_settlement_natural_key_is_unique(): void
    {
        $user = User::factory()->create();
        FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'suggested',
        ]);

        $this->expectException(QueryException::class);

        FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'suggested',
        ]);
    }

    public function test_settlement_state_transitions_do_not_silently_flip_ignored_or_confirmed(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-STATE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $confirmedId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$confirmedId}/confirm")->assertOk();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$confirmedId}/ignore")->assertStatus(409);
        $this->assertSame('confirmed', FinRsuVestSettlement::query()->findOrFail($confirmedId)->status);

        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-IGNORED',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-07-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $ignoredSuggestion = collect($this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json())
            ->firstWhere('vestDate', '2026-07-01');
        $this->assertNotNull($ignoredSuggestion);
        $ignoredId = $ignoredSuggestion['id'];
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$ignoredId}/ignore")->assertOk();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$ignoredId}/confirm")->assertStatus(409);
        $this->actingAs($user)->putJson("/api/rsu/settlements/{$ignoredId}")->assertStatus(409);
        $this->assertSame('ignored', FinRsuVestSettlement::query()->findOrFail($ignoredId)->status);
    }

    public function test_settlement_confirmation_uses_route_settlement_for_updates(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-ROUTE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $target = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 0,
            'gross_income' => 0,
            'status' => 'suggested',
        ]);
        $other = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'TSLA',
            'gross_shares' => 20,
            'gross_income' => 2000,
            'status' => 'suggested',
        ]);

        $response = $this->actingAs($user)->postJson("/api/rsu/settlements/{$target->id}/confirm", [
            'settlement_id' => $other->id,
        ])->assertOk();

        $target->refresh();
        $other->refresh();

        $this->assertSame($target->id, $response->json('id'));
        $this->assertSame('confirmed', $target->status);
        $this->assertSame('suggested', $other->status);
        $this->assertSame('2000.0000', $other->gross_income);
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

    public function test_quote_backfill_reconciles_confirmed_settlement_totals(): void
    {
        Carbon::setTestNow('2026-06-09');
        $user = $this->grantFeatures(User::factory()->create(), ['finance.rsu.manage']);
        $priced = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-BACKFILL-A',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $missing = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-BACKFILL-B',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
        ]);
        StockQuotesDaily::query()->create(['c_symb' => 'META', 'c_date' => '2026-06-01', 'c_open' => 200, 'c_high' => 200, 'c_low' => 200, 'c_close' => 200, 'c_vol' => 0]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 250,
        ])->assertOk()->assertJsonPath('gross_shares', '6.000000');

        $this->actingAs($user)->getJson('/api/rsu')->assertOk();

        $this->assertSame('200.000000', $missing->refresh()->vest_price);
        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $this->assertSame('10.000000', $settlement->gross_shares);
        $this->assertSame('140.000000', $settlement->vest_price);
        $this->assertSame('1400.0000', $settlement->gross_income);
        $this->assertSame('420.0000', $settlement->withheld_value);
        $this->assertSame('170.0000', $settlement->excess_refund);
        $this->assertSame(2, $settlement->allocations->count());
        $this->assertSame('800.0000', $settlement->allocations->firstWhere('equity_award_id', $missing->id)->gross_income);
        $this->assertSame('600.0000', $settlement->allocations->firstWhere('equity_award_id', $priced->id)->gross_income);
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

    public function test_settlement_confirmation_allows_negative_excess_refund(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-NEG-REFUND',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 2,
            'actualTaxRemitted' => 250,
        ])->assertOk()->assertJsonPath('withheld_value', '200.0000')->assertJsonPath('excess_refund', '-50.0000');

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $this->assertSame('-50.0000', $settlement->excess_refund);
        $this->assertSame('-50.0000', $settlement->allocations->first()->allocated_excess_refund);
    }

    public function test_allocation_rounding_residuals_sum_to_settlement_totals(): void
    {
        $user = User::factory()->create();
        foreach (['A', 'B', 'C'] as $suffix) {
            FinEquityAwards::query()->create([
                'uid' => $user->id,
                'award_id' => 'RSU-ROUND-'.$suffix,
                'grant_date' => '2025-01-01',
                'vest_date' => '2026-06-01',
                'share_count' => 1,
                'symbol' => 'META',
                'vest_price' => 100,
                'vest_price_source' => 'manual',
            ]);
        }

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 1,
            'actualTaxRemitted' => 100,
        ])->assertOk();

        $allocations = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId)->allocations;
        $this->assertSame('1.0000000000', number_format((float) $allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->allocation_ratio), 10, '.', ''));
        $this->assertSame('1.000000', number_format((float) $allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->allocated_withheld_shares), 6, '.', ''));
        $this->assertSame('100.0000', number_format((float) $allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->allocated_withheld_value), 4, '.', ''));
        $this->assertSame('100.0000', number_format((float) $allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->allocated_tax_remitted), 4, '.', ''));
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

    public function test_payslip_rsu_links_include_settlement_level_payslips(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.rsu.view']);
        $this->actingAs($user);
        $payslip = FinPayslips::query()->create([
            'uid' => $user->id,
            'pay_date' => '2026-06-15',
            'earnings_rsu' => 1000,
        ]);
        $settlement = FinRsuVestSettlement::query()->create([
            'uid' => $user->id,
            'vest_date' => '2026-06-01',
            'symbol' => 'META',
            'gross_shares' => 10,
            'gross_income' => 1000,
            'payslip_id' => $payslip->payslip_id,
            'refund_payslip_id' => $payslip->payslip_id,
            'status' => 'confirmed',
        ]);

        $response = $this->actingAs($user)
            ->getJson("/api/payslips/{$payslip->payslip_id}/rsu-links")
            ->assertOk();

        $this->assertEqualsCanonicalizing(
            ['payslip_rsu_excess_refund', 'payslip_rsu_income'],
            collect($response->json())->pluck('link_type')->all()
        );
        $this->assertSame($settlement->id, $response->json('0.settlement.id'));
    }

    public function test_transaction_rsu_links_are_uid_scoped(): void
    {
        $user = $this->grantFeatures(User::factory()->create(), ['finance.rsu.view']);
        $other = User::factory()->create();

        $this->actingAs($user);
        $account = FinAccounts::query()->create(['acct_name' => 'Brokerage']);
        $transaction = FinAccountLineItems::query()->create([
            't_account' => $account->acct_id,
            't_date' => '2026-06-01',
            't_amt' => 700,
            't_symbol' => 'META',
            't_qty' => 7,
        ]);

        $ownLink = FinRsuLink::query()->create([
            'uid' => $user->id,
            'link_type' => 'share_deposit',
            'transaction_id' => $transaction->t_id,
            'status' => 'confirmed',
        ]);
        FinRsuLink::query()->create([
            'uid' => $other->id,
            'link_type' => 'share_deposit',
            'transaction_id' => $transaction->t_id,
            'status' => 'confirmed',
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/transactions/{$transaction->t_id}/rsu-links")->assertOk();

        $this->assertSame([$ownLink->id], collect($response->json())->pluck('id')->all());
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
            'actualTaxRemitted' => -1,
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
        $wrongDateAward = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-WRONG',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-07-01',
            'share_count' => 2,
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
            'equity_award_id' => $wrongDateAward->id,
        ])->assertNotFound();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
            'equity_award_id' => $secondAward->id,
        ])->assertUnprocessable();

        // A same-date/symbol award that is NOT one of the confirmed settlement's
        // allocated awards must be rejected even without an allocation id.
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'equity_award_id' => $secondAward->id,
        ])->assertUnprocessable();

        // The settlement's own allocated award links successfully by award id alone.
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlement->id}/links", [
            'link_type' => 'tax_lot',
            'equity_award_id' => $award->id,
        ])->assertCreated();
    }

    public function test_rsu_links_reject_all_null_targets_and_duplicate_targets(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-LINK-HARDEN',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();
        $allocation = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId)->allocations->first();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/links", [
            'link_type' => 'tax_lot',
        ])->assertUnprocessable()->assertJsonValidationErrorFor('target');

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
        ])->assertUnprocessable()->assertJsonValidationErrorFor('target');

        $this->assertSame((int) $award->id, (int) FinRsuLink::query()->firstOrFail()->equity_award_id);
    }

    public function test_get_rsu_data_serializes_share_count_as_number(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-SERIAL',
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10.125,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $response = $this->actingAs($user)->getJson('/api/rsu')->assertOk();
        $this->assertSame(10.125, $response->json('0.share_count'));
    }

    public function test_deleting_settled_award_reconciles_settlement_totals(): void
    {
        $user = User::factory()->create();

        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-9',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $deletedAward = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-10',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        $this->actingAs($user)->deleteJson("/api/rsu/{$deletedAward->id}")->assertOk();

        $settlement = FinRsuVestSettlement::query()
            ->where('uid', $user->id)
            ->whereDate('vest_date', '2026-06-01')
            ->where('symbol', 'META')
            ->with('allocations')
            ->firstOrFail();
        $this->assertSame('6.000000', $settlement->gross_shares);
        $this->assertSame('600.0000', $settlement->gross_income);
        $this->assertCount(1, $settlement->allocations);

        $this->actingAs($user)->getJson('/api/rsu/tax-projection?year=2026')
            ->assertOk()
            ->assertJsonPath('ordinaryIncomeAtVest', 600)
            ->assertJsonPath('withholdingValue', 0);
    }

    public function test_deleting_unconfirmed_suggested_award_removes_no_allocation_settlement(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-SUGGEST-DELETE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json('0.id');
        $this->assertSame(0, FinRsuVestSettlement::query()->findOrFail($settlementId)->allocations()->count());

        $this->actingAs($user)->deleteJson("/api/rsu/{$award->id}")->assertOk();

        $this->assertDatabaseMissing('fin_rsu_vest_settlements', ['id' => $settlementId]);
    }

    public function test_award_id_longer_than_column_width_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/rsu', [[
            'award_id' => str_repeat('A', 21),
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 5,
            'symbol' => 'META',
        ]])->assertUnprocessable()->assertJsonValidationErrorFor('award_id');

        $this->assertSame(0, FinEquityAwards::query()->count());

        $this->actingAs($user)->postJson('/api/rsu', [[
            'award_id' => str_repeat('A', 20),
            'grant_date' => '2026-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 5,
            'symbol' => 'META',
        ]])->assertOk();

        $this->assertSame(1, FinEquityAwards::query()->count());
    }

    public function test_settlement_confirmation_rejects_non_numeric_strings_instead_of_silently_zeroing(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-NUM',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 'abc',
            'actualTaxRemitted' => 100,
        ])->assertUnprocessable()->assertJsonValidationErrorFor('withheld_shares_whole');

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 'not-a-number',
        ])->assertUnprocessable()->assertJsonValidationErrorFor('actual_tax_remitted');

        $settlement = FinRsuVestSettlement::query()->findOrFail($settlementId);
        $this->assertSame('suggested', $settlement->status);
    }

    public function test_settlement_confirmation_treats_blank_strings_as_null(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-BLANK',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');

        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => '',
            'actualTaxRemitted' => '',
        ])->assertOk();

        $settlement = FinRsuVestSettlement::query()->findOrFail($settlementId);
        $this->assertNull($settlement->withheld_shares_whole);
        $this->assertNull($settlement->actual_tax_remitted);
    }

    public function test_updating_settlement_preserves_allocation_links(): void
    {
        $user = User::factory()->create();
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-LINK-A',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-LINK-B',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 250,
        ])->assertOk();

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $allocation = $settlement->allocations->first();

        $link = $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
        ])->assertCreated()->json('id');

        $this->actingAs($user)->putJson("/api/rsu/settlements/{$settlementId}", [
            'withheldSharesWhole' => 4,
            'actualTaxRemitted' => 300,
        ])->assertOk();

        $this->assertDatabaseHas('fin_rsu_links', ['id' => $link]);
        $this->assertDatabaseHas('fin_rsu_vest_settlement_allocations', ['id' => $allocation->id]);
        $settlement->refresh()->load('allocations');
        $this->assertSame('4.000000', $settlement->withheld_shares_whole);
    }

    public function test_editing_award_share_count_reconciles_confirmed_settlement(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-EDIT',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);
        FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-EDIT2',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 4,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-EDIT',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 16,
            'symbol' => 'META',
            'vest_price' => 100,
        ]])->assertOk();

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $this->assertSame('20.000000', $settlement->gross_shares);
        $this->assertSame('2000.0000', $settlement->gross_income);
        $editedAllocation = $settlement->allocations->firstWhere('equity_award_id', $award->id);
        $this->assertSame('16.000000', $editedAllocation->vested_shares);
    }

    public function test_moving_only_award_out_of_bucket_removes_stale_settlement(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-MOVE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
        ])->assertOk();

        // Move the only priced award to a different vest date (a new bucket).
        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-MOVE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-07-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
        ]])->assertOk();

        // The old settlement and its allocations must be gone, not recomputed
        // from the stale allocation tied to the moved award.
        $this->assertDatabaseMissing('fin_rsu_vest_settlements', ['id' => $settlementId]);
        $this->assertDatabaseMissing('fin_rsu_vest_settlement_allocations', ['settlement_id' => $settlementId]);
    }

    public function test_clearing_only_vest_price_removes_settlement(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-CLEAR',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-CLEAR',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'clear_vest_price' => true,
        ]])->assertOk();

        $this->assertDatabaseMissing('fin_rsu_vest_settlements', ['id' => $settlementId]);
        $this->assertDatabaseMissing('fin_rsu_vest_settlement_allocations', ['settlement_id' => $settlementId]);
    }

    public function test_editing_vest_price_recomputes_withheld_value_and_refund(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-PRICE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 3,
            'actualTaxRemitted' => 250,
        ])->assertOk()->assertJsonPath('withheld_value', '300.0000');

        // Correct the vest price upward; withheld value/refund must follow.
        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-PRICE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 200,
        ]])->assertOk();

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $this->assertSame('2000.0000', $settlement->gross_income);
        $this->assertSame('600.0000', $settlement->withheld_value);
        $this->assertSame('350.0000', $settlement->excess_refund);
        $this->assertSame('600.0000', $settlement->allocations->first()->allocated_withheld_value);
    }

    public function test_reducing_shares_below_withheld_clamps_withheld_shares(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-REDUCE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 8,
            'actualTaxRemitted' => 300,
        ])->assertOk();

        // Reduce vested shares below the recorded withheld share count.
        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-REDUCE',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 5,
            'symbol' => 'META',
            'vest_price' => 100,
        ]])->assertOk();

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $this->assertSame('5.000000', $settlement->gross_shares);
        // Withheld shares clamped to gross; you cannot withhold more than vested.
        $this->assertSame('5.000000', $settlement->withheld_shares_whole);
        $this->assertSame('500.0000', $settlement->withheld_value);
        $this->assertSame('200.0000', $settlement->excess_refund);
        $allocation = $settlement->allocations->first();
        $this->assertLessThanOrEqual(
            (float) $allocation->vested_shares,
            (float) $allocation->allocated_withheld_shares,
        );
    }

    public function test_reducing_to_fractional_gross_floors_withheld_shares(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-FRAC',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm", [
            'withheldSharesWhole' => 8,
            'actualTaxRemitted' => 300,
        ])->assertOk();

        // Reduce gross to a fractional share count below the withheld count.
        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-FRAC',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 5.5,
            'symbol' => 'META',
            'vest_price' => 100,
        ]])->assertOk();

        $settlement = FinRsuVestSettlement::query()->findOrFail($settlementId);
        $this->assertSame('5.500000', $settlement->gross_shares);
        // withheld_shares_whole must stay whole: floor(5.5) = 5, never 5.5.
        $this->assertSame('5.000000', $settlement->withheld_shares_whole);
        $this->assertSame('500.0000', $settlement->withheld_value);
    }

    public function test_batch_upsert_does_not_delete_settlement_during_transient_empty_bucket(): void
    {
        $user = User::factory()->create();
        $stay = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-MOVE-OUT',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 6,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        // One payload that moves the only award out of the bucket AND adds a
        // replacement award into the same bucket. The bucket is transiently empty
        // between the two rows, but non-empty once the whole payload is applied.
        $this->actingAs($user)->postJson('/api/rsu', [
            [
                'id' => $stay->id,
                'award_id' => 'RSU-MOVE-OUT',
                'grant_date' => '2025-01-01',
                'vest_date' => '2026-07-01',
                'share_count' => 6,
                'symbol' => 'META',
                'vest_price' => 100,
            ],
            [
                'award_id' => 'RSU-MOVE-IN',
                'grant_date' => '2025-01-01',
                'vest_date' => '2026-06-01',
                'share_count' => 4,
                'symbol' => 'META',
                'vest_price' => 100,
            ],
        ])->assertOk();

        // The settlement survives (it is not deleted-and-lost mid-batch) and now
        // reflects the replacement award.
        $settlement = FinRsuVestSettlement::query()->with('allocations')->find($settlementId);
        $this->assertNotNull($settlement, 'settlement must not be deleted during the transient empty-bucket state');
        $this->assertSame('4.000000', $settlement->gross_shares);
        $replacement = FinEquityAwards::query()->where('award_id', 'RSU-MOVE-IN')->firstOrFail();
        $this->assertSame((int) $replacement->id, (int) $settlement->allocations->first()->equity_award_id);
    }

    public function test_reconciliation_backfills_award_id_on_legacy_allocation_only_link(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-LEGACY-LINK',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();
        $allocation = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId)->allocations->first();

        // Simulate a legacy allocation-only link created before equity_award_id
        // was derived on link creation.
        $link = FinRsuLink::query()->create([
            'uid' => $user->id,
            'settlement_id' => $settlementId,
            'settlement_allocation_id' => $allocation->id,
            'equity_award_id' => null,
            'link_type' => 'tax_lot',
            'status' => 'confirmed',
        ]);

        // Any reconciliation that updates the allocation in place backfills the link.
        $this->actingAs($user)->postJson('/api/rsu', [[
            'id' => $award->id,
            'award_id' => 'RSU-LEGACY-LINK',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 12,
            'symbol' => 'META',
            'vest_price' => 100,
        ]])->assertOk();

        $this->assertSame((int) $award->id, (int) $link->refresh()->equity_award_id);
    }

    public function test_allocation_only_link_appears_on_award_level_response(): void
    {
        $user = User::factory()->create();
        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-AWLINK',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        $settlement = FinRsuVestSettlement::query()->with('allocations')->findOrFail($settlementId);
        $allocation = $settlement->allocations->first();

        $linkId = $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/links", [
            'link_type' => 'tax_lot',
            'settlement_allocation_id' => $allocation->id,
        ])->assertCreated()->json('id');

        $this->assertDatabaseHas('fin_rsu_links', [
            'id' => $linkId,
            'equity_award_id' => $award->id,
        ]);

        $response = $this->actingAs($user)->getJson('/api/rsu')->assertOk();
        $linkIds = collect($response->json('0.rsu_links'))->pluck('id')->all();
        $this->assertContains($linkId, $linkIds);
    }

    public function test_deleting_all_settlement_awards_removes_settlement_row(): void
    {
        $user = User::factory()->create();

        $award = FinEquityAwards::query()->create([
            'uid' => $user->id,
            'award_id' => 'RSU-11',
            'grant_date' => '2025-01-01',
            'vest_date' => '2026-06-01',
            'share_count' => 10,
            'symbol' => 'META',
            'vest_price' => 100,
            'vest_price_source' => 'manual',
        ]);

        $settlementId = $this->actingAs($user)->postJson('/api/rsu/settlements/suggest')->assertOk()->json('0.id');
        $this->actingAs($user)->postJson("/api/rsu/settlements/{$settlementId}/confirm")->assertOk();

        $this->actingAs($user)->deleteJson("/api/rsu/{$award->id}")->assertOk();

        $this->assertSame(0, FinRsuVestSettlement::query()->count());
        $this->actingAs($user)->getJson('/api/rsu/tax-projection?year=2026')
            ->assertOk()
            ->assertJsonPath('ordinaryIncomeAtVest', 0);
    }
}
