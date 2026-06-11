<?php

namespace Tests\Unit\Finance;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\User;
use App\Services\Finance\Rsu\RsuTransactionMatcher;
use Tests\TestCase;

class RsuTransactionMatcherTest extends TestCase
{
    public function test_transaction_candidates_use_inclusive_vest_date_window_and_symbol_or_description_match(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $settlement = $this->makeSettlement($user, '2026-06-15', 'META', 100);

        $startBoundary = $this->makeTransaction($account, [
            't_date' => '2026-06-08',
            't_symbol' => 'META',
            't_description' => 'Share deposit',
        ]);
        $endBoundary = $this->makeTransaction($account, [
            't_date' => '2026-06-29',
            't_symbol' => 'TSLA',
            't_description' => 'META sell-to-cover',
        ]);
        $this->makeTransaction($account, [
            't_date' => '2026-06-07',
            't_symbol' => 'META',
            't_description' => 'Too early',
        ]);
        $this->makeTransaction($account, [
            't_date' => '2026-06-30',
            't_symbol' => 'META',
            't_description' => 'Too late',
        ]);
        $this->makeTransaction($account, [
            't_date' => '2026-06-15',
            't_symbol' => 'TSLA',
            't_description' => 'No symbol text match',
        ]);

        $candidates = app(RsuTransactionMatcher::class)->transactionCandidates($settlement);

        $this->assertEqualsCanonicalizing(
            [$startBoundary->t_id, $endBoundary->t_id],
            collect($candidates)->pluck('id')->all(),
        );
    }

    public function test_transaction_confidence_scores_symbol_and_price_but_not_quantity(): void
    {
        $user = User::factory()->create();
        $account = $this->makeAccount($user);
        $settlement = $this->makeSettlement($user, '2026-06-15', 'META', 100);

        $matchedQuantity = $this->makeTransaction($account, [
            't_symbol' => 'META',
            't_qty' => 10,
            't_price' => 100,
            't_description' => 'Matched quantity',
        ]);
        $mismatchedQuantity = $this->makeTransaction($account, [
            't_symbol' => 'META',
            't_qty' => 999,
            't_price' => 100,
            't_description' => 'Mismatched quantity',
        ]);
        $symbolOnly = $this->makeTransaction($account, [
            't_symbol' => 'META',
            't_price' => 125,
            't_description' => 'Symbol only',
        ]);
        $descriptionAndPrice = $this->makeTransaction($account, [
            't_symbol' => 'TSLA',
            't_price' => 100,
            't_description' => 'META description and price',
        ]);
        $descriptionOnly = $this->makeTransaction($account, [
            't_symbol' => 'TSLA',
            't_price' => 125,
            't_description' => 'META description only',
        ]);

        $candidates = collect(app(RsuTransactionMatcher::class)->transactionCandidates($settlement))->keyBy('id');

        $this->assertSame(999, (int) $candidates[$mismatchedQuantity->t_id]['quantity']);
        $this->assertEqualsWithDelta(0.85, $candidates[$matchedQuantity->t_id]['confidence'], 0.0001);
        $this->assertEqualsWithDelta(0.85, $candidates[$mismatchedQuantity->t_id]['confidence'], 0.0001);
        $this->assertEqualsWithDelta(0.60, $candidates[$symbolOnly->t_id]['confidence'], 0.0001);
        $this->assertEqualsWithDelta(0.50, $candidates[$descriptionAndPrice->t_id]['confidence'], 0.0001);
        $this->assertEqualsWithDelta(0.25, $candidates[$descriptionOnly->t_id]['confidence'], 0.0001);
    }

    public function test_payslip_candidates_use_inclusive_window_and_require_rsu_fields(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $settlement = $this->makeSettlement($user, '2026-06-15', 'META', 100);

        $startBoundary = $this->makePayslip($user, [
            'pay_date' => '2026-06-01',
            'earnings_rsu' => 1000,
        ]);
        $endBoundary = $this->makePayslip($user, [
            'pay_date' => '2026-07-30',
            'ps_rsu_excess_refund' => 25,
        ]);
        $this->makePayslip($user, [
            'pay_date' => '2026-05-31',
            'earnings_rsu' => 1000,
        ]);
        $this->makePayslip($user, [
            'pay_date' => '2026-07-31',
            'earnings_rsu' => 1000,
        ]);
        $this->makePayslip($user, [
            'pay_date' => '2026-06-15',
            'earnings_gross' => 1000,
        ]);

        $candidates = app(RsuTransactionMatcher::class)->payslipCandidates($settlement);

        $this->assertEqualsCanonicalizing(
            [$startBoundary->payslip_id, $endBoundary->payslip_id],
            collect($candidates)->pluck('id')->all(),
        );
        $this->assertEqualsWithDelta(0.75, $candidates[0]['confidence'], 0.0001);
    }

    public function test_candidates_exclude_other_user_transactions_and_payslips(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $settlement = $this->makeSettlement($user, '2026-06-15', 'META', 100);
        $otherAccount = $this->makeAccount($other);
        $this->makeTransaction($otherAccount, [
            't_date' => '2026-06-15',
            't_symbol' => 'META',
            't_price' => 100,
        ]);
        $this->makePayslip($other, [
            'pay_date' => '2026-06-15',
            'earnings_rsu' => 1000,
        ]);

        $this->actingAs($user);
        $matcher = app(RsuTransactionMatcher::class);

        $this->assertSame([], $matcher->transactionCandidates($settlement));
        $this->assertSame([], $matcher->payslipCandidates($settlement));
    }

    private function makeAccount(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $user->id,
            'acct_name' => 'Brokerage',
            'acct_last_balance' => 0,
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeSettlement(User $user, string $vestDate, string $symbol, float $vestPrice, array $overrides = []): FinRsuVestSettlement
    {
        return FinRsuVestSettlement::query()->create(array_merge([
            'uid' => $user->id,
            'vest_date' => $vestDate,
            'symbol' => $symbol,
            'vest_price' => $vestPrice,
            'gross_shares' => 10,
            'gross_income' => 1000,
            'status' => 'confirmed',
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeTransaction(FinAccounts $account, array $overrides = []): FinAccountLineItems
    {
        return FinAccountLineItems::query()->create(array_merge([
            't_account' => $account->acct_id,
            't_date' => '2026-06-15',
            't_symbol' => 'META',
            't_qty' => 10,
            't_price' => 100,
            't_amt' => 1000,
            't_description' => 'META RSU shares',
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makePayslip(User $user, array $overrides = []): FinPayslips
    {
        return FinPayslips::withoutEvents(fn (): FinPayslips => FinPayslips::withoutGlobalScopes()->forceCreate(array_merge([
            'uid' => $user->id,
            'pay_date' => '2026-06-15',
        ], $overrides)));
    }
}
