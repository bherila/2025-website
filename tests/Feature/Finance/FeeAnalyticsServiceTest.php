<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinStatement;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\FeeAnalyticsService;
use App\Services\Finance\MoneyMath;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FeeAnalyticsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_fee_amount_for_line_item_counts_overlapping_signals_once(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $tag = $this->createFeeTag($user, 'fee_schE');
        $feeRow = $this->createLineItem($account, [
            't_type' => 'Fee',
            't_amt' => -50,
            't_fee' => 12,
        ]);
        $feeRow->tags()->attach($tag->tag_id);
        $feeCreditRow = $this->createLineItem($account, [
            't_type' => 'Management Fee',
            't_amt' => 30,
            't_fee' => 99,
        ]);
        $commissionRow = $this->createLineItem($account, [
            't_type' => 'Buy',
            't_amt' => -1000,
            't_fee' => 7.5,
        ]);
        $commissionRow->tags()->attach($tag->tag_id);
        $commissionCreditRow = $this->createLineItem($account, [
            't_type' => 'Buy',
            't_amt' => 1000,
            't_fee' => -2.5,
        ]);

        $service = app(FeeAnalyticsService::class);

        $this->assertSame(50.0, $service->feeAmountForLineItem($feeRow->fresh('tags')));
        $this->assertSame(-30.0, $service->feeAmountForLineItem($feeCreditRow->fresh('tags')));
        $this->assertSame(7.5, $service->feeAmountForLineItem($commissionRow->fresh('tags')));
        $this->assertSame(-2.5, $service->feeAmountForLineItem($commissionCreditRow->fresh('tags')));
    }

    public function test_actual_fees_for_account_buckets_tagged_untagged_and_embedded_fees(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $schETag = $this->createFeeTag($user, 'fee_schE', 'Schedule E Fees');
        $irc67gTag = $this->createFeeTag($user, 'fee_irc67g', 'Personal Fees');

        $this->createLineItem($account, ['t_type' => 'Debit', 't_amt' => -200, 't_fee' => 20])->tags()->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Debit', 't_amt' => 200, 't_fee' => -4])->tags()->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -30])->tags()->attach($irc67gTag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Advisory Fee', 't_amt' => 10])->tags()->attach($irc67gTag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -40]);
        $this->createLineItem($account, ['t_type' => 'Buy', 't_amt' => -1000, 't_fee' => 5]);
        $this->createLineItem($account, ['t_type' => 'Buy', 't_amt' => 1000, 't_fee' => -5]);

        $actual = app(FeeAnalyticsService::class)->actualFeesForAccount((int) $account->acct_id, 2025);

        $this->assertSame(76.0, $actual['total']);
        $this->assertSame(16.0, $actual['by_characteristic']['fee_schE']);
        $this->assertSame(20.0, $actual['by_characteristic']['fee_irc67g']);
        $this->assertSame(40.0, $actual['by_characteristic']['untagged']);
        $this->assertCount(7, $actual['line_items']);
    }

    public function test_actual_fees_nets_fee_credits_against_charges(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $schETag = $this->createFeeTag($user, 'fee_schE', 'Schedule E Fees');

        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -50])->tags()->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => 30])->tags()->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => 0])->tags()->attach($schETag->tag_id);

        $actual = app(FeeAnalyticsService::class)->actualFeesForAccount((int) $account->acct_id, 2025);

        $this->assertSame(20.0, $actual['total']);
        $this->assertSame(20.0, $actual['by_characteristic']['fee_schE']);
        $this->assertSame(0.0, $actual['by_characteristic']['fee_irc67g']);
        $this->assertSame(0.0, $actual['by_characteristic']['untagged']);
        $this->assertSame($actual['total'], MoneyMath::sum(array_values($actual['by_characteristic'])));
        $this->assertCount(2, $actual['line_items']);
        $this->assertContains(-30.0, array_column($actual['line_items'], 'fee_amount'));
    }

    public function test_expected_fees_for_account_prorates_for_mid_year_opened_accounts(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user, [
            'expected_fee_pct' => 1,
            'expected_fee_flat' => 120,
        ]);
        $this->createLineItem($account, ['t_date' => '2025-07-01', 't_type' => 'Deposit', 't_amt' => 12000]);

        foreach (['2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31'] as $date) {
            $this->createStatement($account, $date, 12000);
        }

        $expected = app(FeeAnalyticsService::class)->expectedFeesForAccount($account->fresh(), 2025);

        $this->assertEqualsWithDelta(120.90, $expected, 0.01);
    }

    public function test_expected_and_actual_fees_are_zero_for_account_closed_before_year(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user, [
            'expected_fee_pct' => 1,
            'expected_fee_flat' => 120,
            'when_closed' => '2024-12-31',
        ]);
        $this->createLineItem($account, ['t_date' => '2024-06-01', 't_type' => 'Deposit', 't_amt' => 10000]);
        $this->createLineItem($account, ['t_date' => '2025-02-01', 't_type' => 'Fee', 't_amt' => -50]);

        $service = app(FeeAnalyticsService::class);

        $this->assertSame(0.0, $service->expectedFeesForAccount($account->fresh(), 2025));
        $this->assertSame(0.0, $service->actualFeesForAccount((int) $account->acct_id, 2025)['total']);
    }

    public function test_monthly_fee_drag_series_returns_annualized_return_percentages(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createStatement($account, '2024-12-31', 1000);
        $this->createStatement($account, '2025-01-31', 1100);
        $this->createStatement($account, '2025-02-28', 1125);
        $this->createLineItem($account, ['t_date' => '2025-01-10', 't_type' => 'Deposit', 't_amt' => 100]);
        $this->createLineItem($account, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -10]);
        $this->createLineItem($account, ['t_date' => '2025-01-20', 't_type' => 'Fee', 't_amt' => 4]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeries((int) $account->acct_id, 2025);

        $this->assertCount(12, $series);
        $this->assertSame('2025-01', $series[0]['month']);
        $this->assertSame(6.0, $series[0]['fees']);
        $this->assertSame(0.0, $series[0]['net_return_pct']);
        $this->assertEqualsWithDelta(7.2, $series[0]['gross_return_pct'], 0.0001);
        $this->assertGreaterThanOrEqual($series[0]['net_return_pct'], $series[0]['gross_return_pct']);
        $this->assertFalse($series[0]['is_projected']);
        $this->assertEqualsWithDelta(27.2727, $series[1]['net_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(27.2727, $series[1]['gross_return_pct'], 0.0001);
    }

    public function test_monthly_fee_drag_series_for_accounts_returns_blended_annualized_percentages(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $firstAccount = $this->createAccount($user);
        $secondAccount = $this->createAccount($user);
        $this->createStatement($firstAccount, '2024-12-31', 1000);
        $this->createStatement($firstAccount, '2025-01-31', 1100);
        $this->createLineItem($firstAccount, ['t_date' => '2025-01-10', 't_type' => 'Deposit', 't_amt' => 100]);
        $this->createLineItem($firstAccount, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -10]);
        $this->createStatement($secondAccount, '2024-12-31', 2000);
        $this->createStatement($secondAccount, '2025-01-31', 2100);
        $this->createLineItem($secondAccount, ['t_date' => '2025-01-10', 't_type' => 'Withdrawal', 't_amt' => -50]);
        $this->createLineItem($secondAccount, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -5]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeriesForAccounts([
            (int) $firstAccount->acct_id,
            (int) $secondAccount->acct_id,
        ], 2025);

        $this->assertCount(12, $series);
        $this->assertSame('2025-01', $series[0]['month']);
        $this->assertSame(15.0, $series[0]['fees']);
        $this->assertEqualsWithDelta(60.0, $series[0]['net_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(66.0, $series[0]['gross_return_pct'], 0.0001);
        $this->assertFalse($series[0]['is_projected']);
    }

    public function test_monthly_fee_drag_for_accounts_excludes_fees_from_accounts_without_statement_basis(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        // First account has a full January statement basis (1000 → 1100) and a $10 fee.
        $withStatements = $this->createAccount($user);
        $this->createStatement($withStatements, '2024-12-31', 1000);
        $this->createStatement($withStatements, '2025-01-31', 1100);
        $this->createLineItem($withStatements, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -10]);
        // Second account has a fee but no statements, so it is excluded from the blended denominator.
        // Its fee must not be counted either, or it would overstate gross_return_pct.
        $withoutStatements = $this->createAccount($user);
        $this->createLineItem($withoutStatements, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -20]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeriesForAccounts([
            (int) $withStatements->acct_id,
            (int) $withoutStatements->acct_id,
        ], 2025);

        // Only the statemented account contributes: fees = 10 (not 30), denominator = 1000.
        $this->assertSame(10.0, $series[0]['fees']);
        $this->assertEqualsWithDelta(120.0, $series[0]['net_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(132.0, $series[0]['gross_return_pct'], 0.0001);
    }

    public function test_monthly_fee_drag_returns_null_pct_when_no_starting_balance(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user, ['acct_last_balance' => '0']);
        $this->createLineItem($account, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -10]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeries((int) $account->acct_id, 2025);

        $this->assertSame(10.0, $series[0]['fees']);
        $this->assertNull($series[0]['net_return_pct']);
        $this->assertNull($series[0]['gross_return_pct']);
    }

    public function test_monthly_fee_drag_flags_future_months_as_projected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        // January grows 1000 → 1100 (a 10%/month, 120% annualized actual return); the latest
        // statement closes 2025-01-31, so February onward is projected.
        $this->createStatement($account, '2024-12-31', 1000);
        $this->createStatement($account, '2025-01-31', 1100);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeries((int) $account->acct_id, 2025);

        $this->assertFalse($series[0]['is_projected']);
        $this->assertEqualsWithDelta(120.0, $series[0]['net_return_pct'], 0.0001);

        // Projected months have no in-month statement, so they carry January's annualized return
        // forward as a flat dotted projection rather than dropping to null.
        $this->assertTrue($series[1]['is_projected']);
        $this->assertEqualsWithDelta(120.0, $series[1]['net_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(120.0, $series[1]['gross_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(120.0, $series[11]['net_return_pct'], 0.0001);
    }

    public function test_monthly_fee_drag_projection_stays_null_without_a_prior_actual_return(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        // No statement basis at all: every month is projected but there is no actual return to
        // carry forward, so the percentages remain null gaps.
        $this->createLineItem($account, ['t_date' => '2025-03-15', 't_type' => 'Fee', 't_amt' => -10]);

        $series = app(FeeAnalyticsService::class)->monthlyFeeDragSeries((int) $account->acct_id, 2025);

        $this->assertTrue($series[0]['is_projected']);
        $this->assertNull($series[0]['net_return_pct']);
        $this->assertNull($series[11]['gross_return_pct']);
    }

    public function test_reconcile_k1_fees_flags_unclassified_when_13zz_has_no_fee_subtotal(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $document = $this->createK1Document($user, ['13' => [['code' => 'ZZ', 'value' => '100']]]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('unclassified', $rows[0]['status']);
    }

    public function test_reconcile_k1_fees_flags_mismatch_when_delta_exceeds_threshold(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $document = $this->createK1Document($user, ['13' => [['code' => 'L', 'value' => '50']]]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('mismatch', $rows[0]['status']);
        $this->assertSame(50.0, $rows[0]['delta_schE']);
    }

    public function test_reconcile_k1_fees_flags_match_when_deltas_are_within_threshold(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -25])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_irc67g')->tag_id);
        $document = $this->createK1Document($user, [
            '13' => [
                ['code' => 'L', 'value' => '100.50'],
                ['code' => 'K', 'value' => '24.50'],
            ],
        ]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertSame('match', $rows[0]['status']);
    }

    public function test_reconcile_k1_fees_uses_gross_statement_fees_against_gross_k1(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $schETag = $this->createFeeTag($user, 'fee_schE');
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -100])
            ->tags()
            ->attach($schETag->tag_id);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => 30])
            ->tags()
            ->attach($schETag->tag_id);
        $document = $this->createK1Document($user, ['13' => [['code' => 'L', 'value' => '130']]]);
        TaxDocumentAccount::createLink($document->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $service = app(FeeAnalyticsService::class);
        $actual = $service->actualFeesForAccount((int) $account->acct_id, 2025);
        $rows = $service->reconcileK1Fees((int) $account->acct_id, 2025, $actual);

        $this->assertSame(70.0, $actual['total']);
        $this->assertSame('match', $rows[0]['status']);
        $this->assertSame(130.0, $rows[0]['statement_fees_schE']);
        $this->assertSame(0.0, $rows[0]['delta_schE']);
    }

    public function test_reconcile_k1_fees_compares_multiple_linked_k1s_in_aggregate(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -150])
            ->tags()
            ->attach($this->createFeeTag($user, 'fee_schE')->tag_id);
        $firstDocument = $this->createK1Document($user, ['13' => [['code' => 'L', 'value' => '100']]]);
        $secondDocument = $this->createK1Document($user, ['13' => [['code' => 'L', 'value' => '50']]]);
        TaxDocumentAccount::createLink($firstDocument->id, $account->acct_id, 'k1', 2025, isReviewed: true);
        TaxDocumentAccount::createLink($secondDocument->id, $account->acct_id, 'k1', 2025, isReviewed: true);

        $rows = app(FeeAnalyticsService::class)->reconcileK1Fees((int) $account->acct_id, 2025);

        $this->assertCount(1, $rows);
        $this->assertSame('All linked K-1s', $rows[0]['entity_name']);
        $this->assertSame('match', $rows[0]['status']);
        $this->assertSame(150.0, $rows[0]['k1_fees_schE']);
        $this->assertSame(150.0, $rows[0]['statement_fees_schE']);
    }

    public function test_statement_return_metrics_batches_line_item_lookups(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = $this->createAccount($user);
        $this->createStatement($account, '2024-12-31', 1000);
        $januaryStatement = null;
        $februaryStatement = null;

        for ($index = 1; $index <= 24; $index++) {
            $closingDate = CarbonImmutable::create(2025, 1, 1)
                ->addMonths($index - 1)
                ->endOfMonth()
                ->toDateString();
            $statement = $this->createStatement($account, $closingDate, 1000 + ($index * 100));

            if ($index === 1) {
                $januaryStatement = $statement;
            } elseif ($index === 2) {
                $februaryStatement = $statement;
            }
        }

        $this->assertInstanceOf(FinStatement::class, $januaryStatement);
        $this->assertInstanceOf(FinStatement::class, $februaryStatement);

        $this->createLineItem($account, ['t_date' => '2025-01-10', 't_type' => 'Deposit', 't_amt' => 50]);
        $this->createLineItem($account, ['t_date' => '2025-01-15', 't_type' => 'Fee', 't_amt' => -5]);

        $statements = DB::table('fin_statements')
            ->where('acct_id', $account->acct_id)
            ->orderBy('statement_closing_date')
            ->orderBy('statement_id')
            ->get(['statement_id', 'statement_closing_date', 'balance']);

        DB::flushQueryLog();
        DB::enableQueryLog();

        $metrics = app(FeeAnalyticsService::class)->statementReturnMetrics((int) $account->acct_id, $statements);
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertEqualsWithDelta(5.5, $metrics[(int) $januaryStatement->statement_id]['return_pct'], 0.0001);
        $this->assertEqualsWithDelta(5.5, $metrics[(int) $januaryStatement->statement_id]['ytd_return_pct'], 0.0001);
        $this->assertEqualsWithDelta(9.0909, $metrics[(int) $februaryStatement->statement_id]['return_pct'], 0.0001);
        $this->assertEqualsWithDelta(15.5, $metrics[(int) $februaryStatement->statement_id]['ytd_return_pct'], 0.0001);
        $this->assertLessThanOrEqual(
            4,
            $queryCount,
            "Statement return metrics should batch cash-flow and fee lookups; got {$queryCount} queries",
        );
    }

    public function test_delta_status_treats_negative_actual_as_under_when_expected_is_zero(): void
    {
        $service = app(FeeAnalyticsService::class);

        $this->assertSame('on_target', $service->deltaStatus(0.0, 0.0, true));
        $this->assertSame('under', $service->deltaStatus(-0.01, 0.0, true));
        $this->assertSame('over', $service->deltaStatus(0.01, 0.0, true));
    }

    public function test_fee_api_endpoints_return_shape_require_auth_and_scope_accounts(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $account = $this->createAccount($user, ['expected_fee_flat' => 120]);
        $this->createLineItem($account, ['t_type' => 'Fee', 't_amt' => -40]);

        $this->getJson("/api/finance/{$account->acct_id}/fees?year=2025")->assertUnauthorized();
        $this->actingAs($otherUser)
            ->getJson("/api/finance/{$account->acct_id}/fees?year=2025")
            ->assertNotFound();

        $this->actingAs($user)
            ->getJson("/api/finance/{$account->acct_id}/fees?year=2025")
            ->assertOk()
            ->assertJsonPath('year', 2025)
            ->assertJsonPath('actual.total', 40)
            ->assertJsonStructure([
                'account',
                'actual' => ['total', 'by_characteristic', 'line_items'],
                'expected' => ['total', 'has_expectation'],
                'monthly_fee_drag',
                'reconciliation',
            ]);

        $this->actingAs($user)
            ->getJson('/api/finance/all/fees?year=2025')
            ->assertOk()
            ->assertJsonStructure([
                'totals' => ['total', 'by_characteristic'],
                'accounts',
                'monthly_fee_drag',
                'reconciliation_summary' => ['matched', 'mismatched', 'unclassified', 'unlinked'],
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
            't_fee' => 0,
            't_description' => 'Investment management fee',
        ], $overrides));
    }

    private function createFeeTag(User $user, string $taxCharacteristic, string $label = 'Investment Fee'): FinAccountTag
    {
        return FinAccountTag::create([
            'tag_userid' => (string) $user->id,
            'tag_label' => $label.' '.$taxCharacteristic,
            'tag_color' => '#2563eb',
            'tax_characteristic' => $taxCharacteristic,
        ]);
    }

    private function createStatement(FinAccounts $account, string $closingDate, float $balance): FinStatement
    {
        return FinStatement::create([
            'acct_id' => $account->acct_id,
            'balance' => (string) $balance,
            'statement_opening_date' => substr($closingDate, 0, 8).'01',
            'statement_closing_date' => $closingDate,
        ]);
    }

    /**
     * @param  array<string, array<int, array<string, mixed>>>  $codes
     */
    private function createK1Document(User $user, array $codes): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'k1',
            'original_filename' => 'k1.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => ['B' => ['value' => 'Example Fund LP']],
                'codes' => $codes,
            ],
        ]);
    }
}
