<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\PalCarryforward;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\CapitalGains\CapitalGainsTaxReportService;
use App\Services\Finance\TaxPreviewFacts\Builders\Schedule3FactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\Form1116Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8995Facts;
use App\Services\Finance\TaxPreviewFactsService;
use App\Support\Finance\FederalStandardDeduction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\TestCase;

class TaxPreviewFactsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_schedule1_line5_uses_k1_schedule_e_sources_without_form4952_investment_interest(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AQR Managed Futures', '1' => '0', '2' => '0', '3' => '0', '4' => '0'],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '-74206']],
                    '13' => [
                        ['code' => 'ZZ', 'value' => '8893'],
                        ['code' => 'ZZ', 'value' => '258'],
                        ['code' => 'H', 'value' => '20105'],
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(-83357.0, $facts['schedule1']['line5Total']);
        $this->assertSame(20105.0, $facts['form4952']['totalInvestmentInterestExpense']);
    }

    public function test_unrouted_1099_misc_defaults_to_schedule1_line8z(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'Fidelity',
                'box3_other_income' => 3838.89,
                'box8_substitute_payments' => 0.44,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(3839.33, $facts['schedule1']['line8zTotal']);
        $this->assertSame('default_schedule_1_8z', $facts['schedule1']['line8zSources'][0]['routing']);
        $this->assertTrue($facts['schedule1']['line8zSources'][0]['isReviewed']);
    }

    public function test_schedule1_line9_sums_line8_family_without_mislabeling_line8z(): void
    {
        $user = $this->createUser();
        $line8bDoc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_1_8b',
            'parsed_data' => ['box3_other_income' => 10],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_1_8h',
            'parsed_data' => ['box3_other_income' => 20],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => ['box3_other_income' => 30],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(10.0, $facts['schedule1']['line8bTotal']);
        $this->assertSame(20.0, $facts['schedule1']['line8hTotal']);
        $this->assertSame(0.0, $facts['schedule1']['line8iTotal']);
        $this->assertSame(30.0, $facts['schedule1']['line8zTotal']);
        $this->assertSame(60.0, $facts['schedule1']['line9TotalOtherIncome']);
        $this->assertCount(3, $facts['schedule1']['line8Sources']);
        $this->assertCount(1, $facts['schedule1']['line8zSources']);
        $this->assertSame("doc-{$line8bDoc->id}-schedule1-8b", $facts['schedule1']['line8bSources'][0]['id']);
        $this->assertContains(
            "doc-{$line8bDoc->id}-schedule1-8b",
            array_column($facts['schedule1']['line8Sources'], 'id'),
        );
    }

    public function test_schedule1_wires_1099_g_refunds_and_unemployment_to_part_i(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_g',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'State Agency',
                'box1_unemployment' => 1500,
                'box2_state_local_refunds' => 300,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(300.0, $facts['schedule1']['line1aTotal']);
        $this->assertSame('schedule_1_line_1a', $facts['schedule1']['line1aSources'][0]['routing']);
        $this->assertSame(1500.0, $facts['schedule1']['line7Total']);
        $this->assertSame('schedule_1_line_7', $facts['schedule1']['line7Sources'][0]['routing']);
    }

    public function test_reviewed_zero_1099_misc_keeps_audit_source(): void
    {
        $user = $this->createUser();
        $document = $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Zero Payer', 'box3_other_income' => 0],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(0.0, $facts['schedule1']['line8zTotal']);
        $this->assertCount(1, $facts['schedule1']['line8zSources']);
        $this->assertSame("doc-{$document->id}-schedule1-8z", $facts['schedule1']['line8zSources'][0]['id']);
        $this->assertSame(0.0, $facts['schedule1']['line8zSources'][0]['amount']);
    }

    public function test_schedule1_legacy_line8_routing_defaults_to_line8z(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_1_line_8',
            'parsed_data' => ['box3_other_income' => 12.34],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(12.34, $facts['schedule1']['line8zTotal']);
        $this->assertSame(0.0, $facts['schedule1']['line8bTotal']);
        $this->assertSame('sch_1_line_8', $facts['schedule1']['line8zSources'][0]['routing']);
    }

    public function test_schedule1_stale_unknown_line8_routing_is_excluded_without_crashing(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'stale_legacy_value',
            'parsed_data' => ['box3_other_income' => 12.34],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(0.0, $facts['schedule1']['line8zTotal']);
        $this->assertSame([], $facts['schedule1']['line8zSources']);
    }

    public function test_1099_misc_explicit_schedule_c_or_e_routing_excludes_line8z(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_c',
            'parsed_data' => ['box3_other_income' => 100],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_e',
            'parsed_data' => ['box3_other_income' => 200],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(0.0, $facts['schedule1']['line8zTotal']);
        $this->assertSame([], $facts['schedule1']['line8zSources']);
    }

    public function test_flat_broker_1099_link_uses_parent_review_state_for_misc_line8z(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'Fidelity Consolidated',
                'box3_other_income' => 3.56,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_misc', 2025, isReviewed: false);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertSame(3.56, $facts['schedule1']['line8zTotal']);
        $this->assertSame('link-1-schedule1-8z', $facts['schedule1']['line8zSources'][0]['id']);
        $this->assertFalse($facts['schedule1']['line8zSources'][0]['isReviewed']);
        $this->assertSame('needs_review', $facts['schedule1']['line8zSources'][0]['reviewStatus']);
    }

    public function test_form4952_distinguishes_included_investment_interest_from_excluded_investment_expenses(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AQR', '5' => '100', '6a' => '50', '6b' => '20'],
                codes: [
                    '13' => [['code' => 'H', 'value' => '26320']],
                    '20' => [
                        ['code' => 'A', 'value' => '33300'],
                        ['code' => 'B', 'value' => '86555'],
                    ],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(26320.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame(0.0, $facts['form4952']['totalInvestmentExpenses']);
        $this->assertSame(86555.0, $facts['form4952']['totalExcludedInvestmentExpenses']);
        $this->assertSame('form_4952_line_1', $facts['form4952']['investmentInterestSources'][0]['routing']);
        $this->assertSame([], $facts['form4952']['investmentExpenseSources']);
        $this->assertSame('excluded_form_4952_line_5', $facts['form4952']['excludedInvestmentExpenseSources'][0]['routing']);
    }

    public function test_schedule_b_collects_direct_and_k1_interest_and_dividend_sources(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => false,
            'parsed_data' => [
                [
                    'form_type' => '1099_int',
                    'tax_year' => 2025,
                    'parsed_data' => [
                        'payer_name' => 'Broker',
                        'boxes' => [
                            '1_interest_income' => 10,
                            '3_interest_on_us_savings_bonds_and_treasury_obligations' => 5,
                        ],
                    ],
                ],
                [
                    'form_type' => '1099_div',
                    'tax_year' => 2025,
                    'parsed_data' => [
                        'payer_name' => 'Broker',
                        'boxes' => [
                            '1a_total_ordinary_dividends' => 20,
                            '1b_qualified_dividends' => 8,
                        ],
                    ],
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_int', 2025, isReviewed: true);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2025, isReviewed: true);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'Fund', '5' => '3', '6a' => '7', '6b' => '2']),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleB');

        $this->assertSame(15.0, $facts['scheduleB']['directInterestTotal']);
        $this->assertSame(3.0, $facts['scheduleB']['k1InterestTotal']);
        $this->assertSame(18.0, $facts['scheduleB']['interestTotal']);
        $this->assertSame(20.0, $facts['scheduleB']['directOrdinaryDividendTotal']);
        $this->assertSame(7.0, $facts['scheduleB']['k1OrdinaryDividendTotal']);
        $this->assertSame(27.0, $facts['scheduleB']['ordinaryDividendTotal']);
        $this->assertSame(10.0, $facts['scheduleB']['qualifiedDividendTotal']);
        $this->assertSame(35.0, $facts['scheduleB']['form4952Line5aTotal']);
    }

    public function test_form4952_uses_schedule_b_direct_income_k1_20a_and_margin_interest(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        DB::table('fin_account_line_items')->insert([
            't_account' => $account->acct_id,
            't_date' => '2025-12-31',
            't_type' => 'Margin Interest',
            't_amt' => -4,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 10, 'box3_savings_bond' => 5],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box1a_ordinary' => 20, 'box1b_qualified' => 8],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund', '5' => '3', '6a' => '7', '6b' => '2'],
                codes: [
                    '13' => [['code' => 'H', 'value' => '20']],
                    '20' => [['code' => 'A', 'value' => '30']],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(24.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame(35.0, $facts['form4952']['grossInvestmentIncomeFromScheduleB']);
        $this->assertSame(30.0, $facts['form4952']['grossInvestmentIncomeFromK1']);
        $this->assertSame(65.0, $facts['form4952']['grossInvestmentIncomeTotal']);
        $this->assertSame(10.0, $facts['form4952']['totalQualifiedDividends']);
        $this->assertSame(55.0, $facts['form4952']['line4cNetInvestmentIncomeAfterQualifiedDividends']);
        $this->assertSame(55.0, $facts['form4952']['netInvestmentIncomeBeforeQualifiedDividendElection']);
        $this->assertSame('brokerage_margin_interest', $facts['form4952']['investmentInterestSources'][0]['sourceType']);
    }

    public function test_short_dividend_holding_period_resets_after_cover_and_reopen(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $now = now();
        DB::table('fin_account_line_items')->insert([
            [
                't_account' => $account->acct_id,
                't_date' => '2025-01-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-02-01',
                't_type' => 'Buy',
                't_symbol' => 'XYZ',
                't_qty' => 10,
                't_amt' => -900,
                't_method' => 'BUY TO COVER',
                't_description' => null,
                't_comment' => 'YOU BOUGHT SHORT COVER',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-03-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-03-20',
                't_type' => 'Dividend',
                't_symbol' => 'XYZ',
                't_qty' => null,
                't_amt' => -50,
                't_method' => null,
                't_description' => 'SHORT DIVIDEND CHARGED',
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(0.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame([], $facts['form4952']['investmentInterestSources']);
    }

    public function test_short_dividend_same_day_cover_and_reopen_uses_transaction_sequence(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $now = now();
        DB::table('fin_account_line_items')->insert([
            [
                't_account' => $account->acct_id,
                't_date' => '2025-01-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-03-01',
                't_type' => 'Buy',
                't_symbol' => 'XYZ',
                't_qty' => 10,
                't_amt' => -900,
                't_method' => 'BUY TO COVER',
                't_description' => null,
                't_comment' => 'YOU BOUGHT SHORT COVER',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-03-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-04-20',
                't_type' => 'Dividend',
                't_symbol' => 'XYZ',
                't_qty' => 10,
                't_amt' => -50,
                't_method' => null,
                't_description' => 'SHORT DIVIDEND CHARGED',
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(50.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame(-50.0, $facts['form4952']['investmentInterestSources'][0]['amount']);
    }

    public function test_short_dividend_holding_period_can_start_before_tax_year(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $now = now();
        DB::table('fin_account_line_items')->insert([
            [
                't_account' => $account->acct_id,
                't_date' => '2024-12-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-01-20',
                't_type' => 'Dividend',
                't_symbol' => 'XYZ',
                't_qty' => null,
                't_amt' => -50,
                't_method' => null,
                't_description' => 'SHORT DIVIDEND CHARGED',
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(50.0, $facts['form4952']['totalInvestmentInterestExpense']);
    }

    public function test_short_dividend_uses_fifo_open_lot_when_short_positions_are_stacked(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $now = now();
        DB::table('fin_account_line_items')->insert([
            [
                't_account' => $account->acct_id,
                't_date' => '2025-01-01',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-03-25',
                't_type' => 'Sell Short',
                't_symbol' => 'XYZ',
                't_qty' => -10,
                't_amt' => 1000,
                't_method' => 'SELL SHORT',
                't_description' => null,
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                't_account' => $account->acct_id,
                't_date' => '2025-04-20',
                't_type' => 'Dividend',
                't_symbol' => 'XYZ',
                't_qty' => 10,
                't_amt' => -50,
                't_method' => null,
                't_description' => 'SHORT DIVIDEND CHARGED',
                't_comment' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(50.0, $facts['form4952']['totalInvestmentInterestExpense']);
    }

    public function test_form4952_reconstructs_k1_gross_investment_income_when_box_20a_is_absent(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund', '5' => '100', '6a' => '50', '6b' => '20'],
                codes: [
                    '11' => [['code' => 'C', 'value' => '30']],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(160.0, $facts['form4952']['grossInvestmentIncomeFromK1']);
        $this->assertSame(0.0, $facts['form4952']['totalQualifiedDividends']);
        $this->assertSame(160.0, $facts['form4952']['netInvestmentIncomeBeforeQualifiedDividendElection']);
    }

    public function test_broker_1099_link_matching_prefers_identifier_before_name_fallback(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => true,
            'parsed_data' => [
                [
                    'account_identifier' => '1111',
                    'account_name' => 'Shared Account Name',
                    'form_type' => '1099_int',
                    'tax_year' => 2025,
                    'parsed_data' => ['payer_name' => 'Broker', 'box1_interest' => 10],
                ],
                [
                    'account_identifier' => '2222',
                    'account_name' => 'Shared Account Name',
                    'form_type' => '1099_int',
                    'tax_year' => 2025,
                    'parsed_data' => ['payer_name' => 'Broker', 'box1_interest' => 99],
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_int', 2025, aiIdentifier: '1111', aiAccountName: 'Shared Account Name');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleB');

        $this->assertSame(10.0, $facts['scheduleB']['interestTotal']);
    }

    public function test_form4952_does_not_classify_full_return_diagnostic_as_k1_interest(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AQR'],
                codes: ['13' => [['code' => 'H', 'value' => '26320']]],
                warnings: ['QD election not needed because total investment interest ($33,897) is already allowed.'],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');

        $this->assertSame(26320.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertCount(1, $facts['form4952']['investmentInterestSources']);
        $this->assertSame('k1_investment_interest', $facts['form4952']['investmentInterestSources'][0]['sourceType']);
    }

    public function test_form4952_preserves_k1_box13_signs_while_totaling_absolute_expense(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund Positive'],
                codes: ['13' => [['code' => 'H', 'value' => '100']]],
            ),
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund Negative'],
                codes: ['13' => [['code' => 'H', 'value' => '-25']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form4952');
        $sourcesByLabel = collect($facts['form4952']['investmentInterestSources'])->keyBy('label');

        $this->assertSame(125.0, $facts['form4952']['totalInvestmentInterestExpense']);
        $this->assertSame(100.0, $sourcesByLabel['Fund Positive — Box 13H']['amount']);
        $this->assertStringContainsString('positive K-1 Box 13', $sourcesByLabel['Fund Positive — Box 13H']['notes']);
        $this->assertSame(-25.0, $sourcesByLabel['Fund Negative — Box 13H']['amount']);
    }

    public function test_schedule_d_and_form8949_facts_use_canonical_php_capital_gains_report(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);

        $lossLot = $this->createLot($account, [
            'symbol' => 'TSLA',
            'description' => 'Tesla Inc.',
            'purchase_date' => '2025-01-01',
            'sale_date' => '2025-12-01',
            'cost_basis' => 1000,
            'proceeds' => 800,
            'form_8949_box' => 'A',
        ]);
        $this->createLot($account, [
            'symbol' => 'TSLA',
            'description' => 'Tesla Inc.',
            'purchase_date' => '2025-12-01',
            'sale_date' => null,
            'cost_basis' => 1000,
            'proceeds' => null,
            'form_8949_box' => null,
        ]);
        $this->createLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Microsoft Corp.',
            'purchase_date' => '2023-01-01',
            'sale_date' => '2025-11-01',
            'cost_basis' => 1500,
            'proceeds' => 2000,
            'is_short_term' => false,
            'form_8949_box' => 'D',
        ]);

        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund', '8' => '100', '9a' => '200'],
                codes: [
                    '11' => [
                        ['code' => 'C', 'value' => '1000', 'notes' => 'Section 1256 contracts'],
                        ['code' => 'S', 'value' => '-25', 'notes' => 'Net short-term capital loss'],
                        ['code' => 'S', 'value' => '50', 'notes' => 'Net long-term capital gain'],
                        ['code' => 'S', 'value' => '75', 'notes' => 'Capital gain character pending'],
                    ],
                ],
            ),
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box2a_cap_gain' => 30],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(2, $facts['form8949']['rowCount']);
        $this->assertSame(1, $facts['form8949']['washSaleAdjustmentCount']);
        $this->assertSame(200.0, $facts['form8949']['washSaleAdjustmentTotal']);
        $this->assertSame("account_lot:{$lossLot->lot_id}", $facts['form8949']['washSaleAdjustments'][0]['lossSaleId']);
        $this->assertSame(0.0, $facts['scheduleD']['line1bGainLoss']);
        $this->assertSame(500.0, $facts['scheduleD']['line8bGainLoss']);
        $this->assertSame(0.0, $facts['scheduleD']['line3GainLoss']);
        $this->assertSame(400.0, $facts['scheduleD']['line4GainLoss']);
        $this->assertSame(75.0, $facts['scheduleD']['line5GainLoss']);
        $this->assertSame(0.0, $facts['scheduleD']['line10GainLoss']);
        $this->assertSame(600.0, $facts['scheduleD']['line11GainLoss']);
        $this->assertSame(250.0, $facts['scheduleD']['line12GainLoss']);
        $this->assertSame(30.0, $facts['scheduleD']['line13CapitalGainDistributions']);
        $this->assertSame(475.0, $facts['scheduleD']['line7NetShortTerm']);
        $this->assertSame(1380.0, $facts['scheduleD']['line15NetLongTerm']);
        $this->assertSame(1855.0, $facts['scheduleD']['line16Combined']);
        $this->assertSame(75.0, $facts['scheduleD']['ambiguous11SAmount']);
        $this->assertSame('needs_review_schedule_d_line_5_or_12', $facts['scheduleD']['ambiguous11SSources'][0]['routing']);
    }

    public function test_schedule_d_limited_capital_gains_handles_mixed_sign_business_and_personal(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $this->createLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Microsoft Corp.',
            'purchase_date' => '2023-01-01',
            'sale_date' => '2025-11-01',
            'cost_basis' => 1000,
            'proceeds' => 2000,
            'is_short_term' => false,
            'form_8949_box' => 'D',
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'Business Loss Fund', '8' => '-5000']),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleD');

        $this->assertSame(-5000.0, $facts['scheduleD']['totalBusinessCapGains']);
        $this->assertSame(1000.0, $facts['scheduleD']['totalPersonalCapGains']);
        $this->assertSame(-3000.0, $facts['scheduleD']['line21LimitedLossOrGain']);
        $this->assertSame(-3000.0, $facts['scheduleD']['limitedBusinessCapGains']);
        $this->assertSame(0.0, $facts['scheduleD']['limitedPersonalCapGains']);
    }

    public function test_schedule_d_limited_capital_gains_allocates_same_sign_losses_with_cents_math(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $this->createLot($account, [
            'symbol' => 'MSFT',
            'description' => 'Microsoft Corp.',
            'purchase_date' => '2025-01-01',
            'sale_date' => '2025-11-01',
            'cost_basis' => 3000,
            'proceeds' => 1000,
            'form_8949_box' => 'A',
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'Business Loss Fund', '8' => '-4000']),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleD');

        $this->assertSame(-6000.0, $facts['scheduleD']['line16Combined']);
        $this->assertSame(-3000.0, $facts['scheduleD']['line21LimitedLossOrGain']);
        $this->assertSame(-4000.0, $facts['scheduleD']['totalBusinessCapGains']);
        $this->assertSame(-2000.0, $facts['scheduleD']['totalPersonalCapGains']);
        $this->assertSame(-2000.0, $facts['scheduleD']['limitedBusinessCapGains']);
        $this->assertSame(-1000.0, $facts['scheduleD']['limitedPersonalCapGains']);
    }

    public function test_facts_from_documents_requires_user_id_for_capital_gains_documents(): void
    {
        $user = $this->createUser();
        $document = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'parsed_data' => [],
        ]);

        $this->expectException(InvalidArgumentException::class);

        app(TaxPreviewFactsService::class)->factsFromDocuments(2025, [$document]);
    }

    public function test_tax_preview_slice_avoids_capital_gains_report_when_not_needed(): void
    {
        $user = $this->createUser();
        $this->mock(
            CapitalGainsTaxReportService::class,
            fn ($mock) => $mock->shouldReceive('reportForUserYear')->never(),
        );

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule1');

        $this->assertArrayHasKey('schedule1', $facts);
        $this->assertArrayNotHasKey('form8949', $facts);
    }

    public function test_unmatched_imported_1099b_lots_feed_form8949_facts(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $document = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'is_reviewed' => true,
            'parsed_data' => [],
        ]);
        $this->createLot($account, [
            'tax_document_id' => $document->id,
            'lot_source' => 'import_1099b',
            'purchase_date' => '2025-01-01',
            'sale_date' => '2025-02-01',
            'proceeds' => 125,
            'cost_basis' => 100,
            'close_t_id' => null,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8949');

        $this->assertSame(1, $facts['form8949']['rowCount']);
        $this->assertSame(25.0, $facts['form8949']['rows'][0]['gainOrLoss']);
    }

    public function test_schedule_a_collects_itemized_sources_and_applies_salt_cap(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box17_state_tax' => 6000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 1000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund'],
                codes: ['13' => [
                    ['code' => 'H', 'value' => '200'],
                    ['code' => 'L', 'value' => '75'],
                ]],
            ),
        ]);
        $this->createUserDeduction($user->id, 'state_est_tax', 3000, 'Estimated CA tax');
        $this->createUserDeduction($user->id, 'sales_tax', 2000, 'Sales tax');
        $this->createUserDeduction($user->id, 'real_estate_tax', 4000, 'Property tax');
        $this->createUserDeduction($user->id, 'mortgage_interest', 7000, 'Mortgage interest');
        $this->createUserDeduction($user->id, 'charitable_cash', 500, 'Cash gift');
        $this->createUserDeduction($user->id, 'charitable_noncash', 250, 'Noncash gift');
        $this->createUserDeduction($user->id, 'other', 100, 'Other itemized');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleA');

        $this->assertSame(9000.0, $facts['scheduleA']['stateIncomeTaxTotal']);
        $this->assertSame(2000.0, $facts['scheduleA']['salesTaxTotal']);
        $this->assertSame('state_income_tax', $facts['scheduleA']['selectedLine5aType']);
        $this->assertSame(9000.0, $facts['scheduleA']['selectedLine5aTotal']);
        $this->assertSame(13000.0, $facts['scheduleA']['saltPaidBeforeCap']);
        $this->assertSame(40000.0, $facts['scheduleA']['saltCap']);
        $this->assertSame(13000.0, $facts['scheduleA']['saltDeduction']);
        $this->assertSame(200.0, $facts['scheduleA']['grossInvestmentInterestTotal']);
        $this->assertSame(200.0, $facts['scheduleA']['investmentInterestTotal']);
        $this->assertSame(0.0, $facts['scheduleA']['disallowedInvestmentInterest']);
        $this->assertSame(7200.0, $facts['scheduleA']['totalInterest']);
        $this->assertSame(750.0, $facts['scheduleA']['charitableTotal']);
        $this->assertSame(100.0, $facts['scheduleA']['otherItemizedTotal']);
        $this->assertSame(21050.0, $facts['scheduleA']['totalItemizedDeductions']);
        $this->assertTrue($facts['scheduleA']['shouldItemizeSingle']);
        $k1PortfolioSource = collect($facts['scheduleA']['otherItemizedSources'])->firstWhere('sourceType', 'k1_portfolio_deduction');
        $this->assertNull($k1PortfolioSource);
        $this->assertSame('schedule_a_line_5b', $facts['scheduleA']['realEstateTaxSources'][0]['routing']);
        $this->assertSame('schedule_a_line_5a', $facts['scheduleA']['salesTaxSources'][0]['routing']);
    }

    public function test_schedule_a_uses_2026_standard_deduction_values(): void
    {
        $user = $this->createUser();

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2026, 'scheduleA');

        $this->assertSame(16100.0, $facts['scheduleA']['standardDeductionSingle']);
        $this->assertSame(32200.0, $facts['scheduleA']['standardDeductionMarriedFilingJointly']);
    }

    public function test_schedule_a_uses_2018_standard_deduction_values(): void
    {
        $user = $this->createUser();

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2018, 'scheduleA');

        $this->assertSame(12000.0, $facts['scheduleA']['standardDeductionSingle']);
        $this->assertSame(24000.0, $facts['scheduleA']['standardDeductionMarriedFilingJointly']);
    }

    public function test_federal_standard_deduction_clamps_years_outside_known_table(): void
    {
        $this->assertSame(12000.0, FederalStandardDeduction::single(2017));
        $this->assertSame(32200.0, FederalStandardDeduction::marriedFilingJointly(2027));
    }

    public function test_schedule_a_uses_published_2026_salt_cap_parameters(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax', 2026);
        $this->createTaxDocument($user->id, [
            'tax_year' => 2026,
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 515000],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2026, 'scheduleA');

        $this->assertSame(37400.0, $facts['scheduleA']['saltCap']);
        $this->assertSame(37400.0, $facts['scheduleA']['saltDeduction']);
        $this->assertSame(515000.0, $facts['scheduleA']['saltCapMagi']);
        $this->assertTrue($facts['scheduleA']['saltCapUsesEstimatedMagi']);
    }

    public function test_schedule_a_uses_legacy_salt_cap_for_out_of_table_year(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax', 2024);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024, 'scheduleA');

        $this->assertSame(10000.0, $facts['scheduleA']['saltCap']);
        $this->assertSame(10000.0, $facts['scheduleA']['saltDeduction']);
    }

    public function test_schedule_a_selects_larger_line5a_alternative_before_salt_cap(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'state_est_tax', 5000, 'State tax');
        $this->createUserDeduction($user->id, 'sales_tax', 7000, 'Sales tax');
        $this->createUserDeduction($user->id, 'real_estate_tax', 45000, 'Property tax');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleA');

        $this->assertSame('sales_tax', $facts['scheduleA']['selectedLine5aType']);
        $this->assertSame(7000.0, $facts['scheduleA']['selectedLine5aTotal']);
        $this->assertSame(52000.0, $facts['scheduleA']['saltPaidBeforeCap']);
        $this->assertSame(40000.0, $facts['scheduleA']['saltDeduction']);
    }

    public function test_schedule3_wires_form1116_and_user_entered_credit_sources(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box7_foreign_tax' => 123],
        ]);
        $this->createUserDeduction($user->id, 'schedule3_child_dependent_care_credit', 200, 'Dependent care credit');
        $this->createUserDeduction($user->id, 'schedule3_education_credits', 300, 'Education credit');
        $this->createUserDeduction($user->id, 'schedule3_retirement_savings_credit', 400, 'Saver credit');
        $this->createUserDeduction($user->id, 'schedule3_residential_clean_energy_credit', 500, 'Solar credit');
        $this->createUserDeduction($user->id, 'schedule3_energy_efficient_home_improvement_credit', 600, 'Home energy credit');
        $this->createUserDeduction($user->id, 'schedule3_general_business_credit', 700, 'General business credit');
        $this->createUserDeduction($user->id, 'schedule3_prior_year_minimum_tax_credit', 800, 'AMT credit');
        $this->createUserDeduction($user->id, 'schedule3_other_nonrefundable_credits', 2000, 'Other nonrefundable credit');
        $this->createUserDeduction($user->id, 'schedule3_net_premium_tax_credit', 900, 'Premium tax credit');
        $this->createUserDeduction($user->id, 'schedule3_extension_payment', 1000, 'Extension payment');
        $this->createUserDeduction($user->id, 'schedule3_excess_social_security_withheld', 1100, 'Excess SS withheld');
        $this->createUserDeduction($user->id, 'schedule3_fuel_tax_credit', 1200, 'Fuel tax credit');
        $this->createUserDeduction($user->id, 'schedule3_other_refundable_credits', 1300, 'Other refundable credit');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'schedule3');

        $this->assertSame(123.0, $facts['schedule3']['line1ForeignTaxCredit']);
        $this->assertSame(3500.0, $facts['schedule3']['line7OtherNonrefundableCredits']);
        $this->assertSame(5623.0, $facts['schedule3']['line8TotalNonrefundableCredits']);
        $this->assertSame(5500.0, $facts['schedule3']['line15TotalPaymentsRefundableCredits']);
        $this->assertSame('schedule_3_line_1', $facts['schedule3']['line1Sources'][0]['routing']);
        $this->assertSame('schedule_3_user_entered_credit', $facts['schedule3']['line10Sources'][0]['sourceType']);
        $this->assertNull($facts['schedule3']['line10Sources'][0]['notes']);
    }

    public function test_schedule3_line1_requires_form1116_source_review(): void
    {
        $facts = app(Schedule3FactsBuilder::class)->build(
            new Form1116Facts(
                passiveIncomeSources: [],
                totalPassiveIncome: 0.0,
                generalIncomeSources: [],
                totalGeneralIncome: 0.0,
                foreignTaxSources: [],
                totalForeignTaxes: 123.0,
                line4bSources: [],
                totalLine4b: 0.0,
                sourcedByPartnerElectionSources: [],
                totalSourcedByPartnerIncome: 0.0,
                creditValue: 123.0,
                deductionValueAtThirtySevenPercent: 45.51,
                recommendation: 'credit',
                totalK1Box5: 0.0,
                turboTaxAlert: false,
            ),
            [],
        );

        $this->assertFalse($facts->line1Sources[0]->isReviewed);
        $this->assertSame('needs_review', $facts->line1Sources[0]->reviewStatus);
    }

    public function test_schedule_a_exposes_gross_and_disallowed_investment_interest(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Fund'],
                codes: ['13' => [['code' => 'H', 'value' => '1000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleA');

        $this->assertSame(1000.0, $facts['scheduleA']['grossInvestmentInterestTotal']);
        $this->assertSame(0.0, $facts['scheduleA']['investmentInterestTotal']);
        $this->assertSame(1000.0, $facts['scheduleA']['disallowedInvestmentInterest']);
    }

    public function test_schedule_e_collects_routed_misc_and_k1_partnership_sources(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_e',
            'parsed_data' => ['payer_name' => 'Tenant', 'box1_rents' => 50],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: [
                    'B' => 'Trader Fund',
                    '1' => '100',
                    '2' => '-20',
                    '3' => '10',
                    '4' => '5',
                    '5' => '7',
                    'partnershipPosition_traderInSecurities' => 'true',
                ],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '30']],
                    '13' => [['code' => 'ZZ', 'value' => '12']],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleE');

        $this->assertSame(50.0, $facts['scheduleE']['miscIncomeTotal']);
        $this->assertSame(-10.0, $facts['scheduleE']['totalPassive']);
        $this->assertSame(123.0, $facts['scheduleE']['totalNonpassive']);
        $this->assertSame(18.0, $facts['scheduleE']['totalTraderNii']);
        $this->assertSame(163.0, $facts['scheduleE']['grandTotal']);
    }

    public function test_form1116_collects_k3_and_1099_foreign_tax_sources(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Foreign Fund', '5' => '100'],
                codes: [],
                k3: [
                    'sections' => [
                        [
                            'sectionId' => 'part2_section2',
                            'data' => [
                                'rows' => [
                                    ['line' => '55', 'col_c_passive' => 1000, 'col_d_general' => 50, 'col_f_sourced_by_partner' => 200, 'col_g_total' => 1250],
                                    ['line' => '39', 'col_g_total' => 80],
                                ],
                            ],
                        ],
                        [
                            'sectionId' => 'part3_section2',
                            'data' => ['derivedPassiveAssetRatio' => 0.25],
                        ],
                        [
                            'sectionId' => 'part3_section4',
                            'data' => ['grandTotalUSD' => 150],
                        ],
                    ],
                ],
            ),
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker Div', 'box7_foreign_tax' => 15],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker Int', 'box6_foreign_tax' => 3],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1116');

        $this->assertSame(1300.0, $facts['form1116']['totalPassiveIncome']);
        $this->assertSame(50.0, $facts['form1116']['totalGeneralIncome']);
        $this->assertSame(168.0, $facts['form1116']['totalForeignTaxes']);
        $this->assertSame(20.0, $facts['form1116']['totalLine4b']);
        $this->assertSame(200.0, $facts['form1116']['totalSourcedByPartnerIncome']);
        $this->assertSame('credit', $facts['form1116']['recommendation']);
        $this->assertFalse($facts['form1116']['turboTaxAlert']);
    }

    public function test_form1116_sourced_by_partner_election_excludes_sbp_from_passive_income(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Foreign Fund'],
                k3: [
                    'sections' => [
                        [
                            'sectionId' => 'part2_section2',
                            'data' => [
                                'rows' => [
                                    ['line' => '55', 'col_c_passive' => 1000, 'col_f_sourced_by_partner' => 200],
                                ],
                            ],
                        ],
                    ],
                ],
                k3Elections: ['sourcedByPartnerAsUSSource' => true],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1116');

        $this->assertSame(1000.0, $facts['form1116']['totalPassiveIncome']);
        $this->assertSame(200.0, $facts['form1116']['totalSourcedByPartnerIncome']);
        $this->assertSame('Sourced-by-partner-as-U.S.-source election active.', $facts['form1116']['sourcedByPartnerElectionSources'][0]['notes']);
    }

    public function test_form1116_marks_estimated_1099_div_foreign_income_as_needs_review(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker Div', 'box7_foreign_tax' => 15],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1116');

        $this->assertSame(100.0, $facts['form1116']['totalPassiveIncome']);
        $this->assertFalse($facts['form1116']['passiveIncomeSources'][0]['isReviewed']);
        $this->assertSame('needs_review', $facts['form1116']['passiveIncomeSources'][0]['reviewStatus']);
        $this->assertStringContainsString('Confirm gross foreign-source dividend income', $facts['form1116']['passiveIncomeSources'][0]['reviewAction']);
        $this->assertTrue($facts['form1116']['foreignTaxSources'][0]['isReviewed']);
    }

    public function test_form8960_collects_nii_components_from_backend_facts(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 100],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box1a_ordinary' => 200],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: [
                    'B' => 'NII Fund',
                    '2' => '300',
                    '8' => '500',
                    'partnershipPosition_traderInSecurities' => 'true',
                ],
                codes: [
                    '11' => [['code' => 'ZZ', 'value' => '40']],
                    '13' => [['code' => 'ZZ', 'value' => '10']],
                ],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8960');

        $this->assertSame(100.0, $facts['form8960']['taxableInterest']);
        $this->assertSame(200.0, $facts['form8960']['ordinaryDividends']);
        $this->assertSame(500.0, $facts['form8960']['netCapGains']);
        $this->assertSame(300.0, $facts['form8960']['passiveIncome']);
        $this->assertSame(30.0, $facts['form8960']['nonpassiveTradingIncome']);
        $this->assertSame(1130.0, $facts['form8960']['grossNII']);
        $this->assertSame(1130.0, $facts['form8960']['netInvestmentIncome']);
        $this->assertNull($facts['form8960']['magi']);
        $this->assertTrue($facts['form8960']['needsMagi']);
    }

    public function test_salt_cap_phases_down_using_estimated_magi_in_facts_for_year(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax');
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 510000],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(37000.0, $facts['scheduleA']['saltCap']);
        $this->assertSame(37000.0, $facts['scheduleA']['saltDeduction']);
        $this->assertTrue($facts['scheduleA']['saltCapUsesEstimatedMagi']);
        $this->assertNull($facts['form8960']['magi']);
        $this->assertTrue($facts['form8960']['needsMagi']);
    }

    public function test_salt_cap_uses_floor_after_full_phase_down(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax');
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 600000],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleA');

        $this->assertSame(10000.0, $facts['scheduleA']['saltCap']);
        $this->assertSame(10000.0, $facts['scheduleA']['saltDeduction']);
    }

    public function test_salt_cap_without_magi_uses_flat_2025_cap(): void
    {
        $user = $this->createUser();
        $deduction = $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax');

        $facts = app(TaxPreviewFactsService::class)->factsFromDocuments(
            year: 2025,
            documents: [],
            userDeductions: [$deduction],
        );

        $this->assertSame(40000.0, $facts->scheduleA->saltCap);
        $this->assertSame(40000.0, $facts->scheduleA->saltDeduction);
        $this->assertTrue($facts->scheduleA->saltCapNeedsMagi);
        $this->assertFalse($facts->scheduleA->saltCapUsesEstimatedMagi);
        $this->assertTrue($facts->form8960->needsMagi);
    }

    public function test_user_supplied_magi_drives_salt_and_form8960_without_prompt(): void
    {
        $user = $this->createUser();
        $deduction = $this->createUserDeduction($user->id, 'state_est_tax', 60000, 'State tax');

        $facts = app(TaxPreviewFactsService::class)->factsFromDocuments(
            year: 2025,
            documents: [],
            userDeductions: [$deduction],
            magi: 510000.0,
        );

        $this->assertSame(37000.0, $facts->scheduleA->saltCap);
        $this->assertSame(37000.0, $facts->scheduleA->saltDeduction);
        $this->assertFalse($facts->scheduleA->saltCapUsesEstimatedMagi);
        $this->assertSame(510000.0, $facts->form8960->magi);
        $this->assertFalse($facts->form8960->needsMagi);
    }

    public function test_form8960_synthesized_source_ids_are_scoped_by_user_and_year(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 1000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Investment Fund'],
                codes: ['13' => [['code' => 'H', 'value' => '50']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8960');

        $sourceIds = array_column($facts['form8960']['componentSources'], 'id');
        $investmentInterestId = collect($sourceIds)->first(fn (string $id): bool => str_contains($id, 'form4952-form8960-line9a'));

        $this->assertNotNull($investmentInterestId);
        $this->assertStringStartsWith("{$user->id}-2025-", $investmentInterestId);
    }

    public function test_schedule_c_builds_per_entity_rollups_and_feeds_schedule1_line3(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $consultingEntityId = $this->createEmploymentEntity($user->id, 'Consulting LLC');
        $writingEntityId = $this->createEmploymentEntity($user->id, 'Writing Studio');

        $consultingIncomeTag = $this->createScheduleCTag($user->id, $consultingEntityId, 'business_income', 'Consulting income');
        $consultingExpenseTag = $this->createScheduleCTag($user->id, $consultingEntityId, 'sce_office_expenses', 'Consulting office');
        $writingIncomeTag = $this->createScheduleCTag($user->id, $writingEntityId, 'business_income', 'Writing income');
        $this->tagTransaction($account->acct_id, $consultingIncomeTag, '2025-02-01', 10000);
        $this->tagTransaction($account->acct_id, $consultingExpenseTag, '2025-03-01', -1200);
        $this->tagTransaction($account->acct_id, $writingIncomeTag, '2025-04-01', 5000);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(15000.0, $facts['scheduleC']['grossReceiptsTotal']);
        $this->assertSame(1200.0, $facts['scheduleC']['expensesTotal']);
        $this->assertSame(13800.0, $facts['scheduleC']['netProfit']);
        $this->assertSame(13800.0, $facts['scheduleC']['netProfitRoutedToSchedule1']);
        $this->assertSame(13800.0, $facts['schedule1']['line3Total']);
        $this->assertCount(2, $facts['scheduleC']['entities']);
    }

    public function test_schedule_c_cumulative_quarter_totals_allocate_home_office_and_reconcile_q4(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Quarterly LLC');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $homeOfficeTag = $this->createScheduleCTag($user->id, $entityId, 'scho_rent', 'Home office rent');

        $this->tagTransaction($account->acct_id, $incomeTag, '2025-02-01', 100);
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-05-01', 200);
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-08-01', 300);
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-11-01', 400);
        $this->tagTransaction($account->acct_id, $homeOfficeTag, '2025-12-01', -100);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleC');

        $this->assertSame(900.0, $facts['scheduleC']['netProfit']);
        $this->assertSame([
            'q1' => 90.0,
            'q2' => 270.0,
            'q3' => 540.0,
            'q4' => 900.0,
        ], $facts['scheduleC']['netProfitCumulativeByQuarter']);
    }

    public function test_schedule_c_home_office_limits_and_carries_forward(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Small Profit LLC');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $expenseTag = $this->createScheduleCTag($user->id, $entityId, 'sce_supplies', 'Supplies');
        $homeOfficeTag = $this->createScheduleCTag($user->id, $entityId, 'scho_rent', 'Home office rent');

        $this->tagTransaction($account->acct_id, $incomeTag, '2024-02-01', 1000);
        $this->tagTransaction($account->acct_id, $expenseTag, '2024-02-15', -700);
        $this->tagTransaction($account->acct_id, $homeOfficeTag, '2024-03-01', -500);
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-02-01', 2000);
        $this->tagTransaction($account->acct_id, $expenseTag, '2025-02-15', -1000);
        $this->tagTransaction($account->acct_id, $homeOfficeTag, '2025-03-01', -100);
        $this->createForm8829Input($user->id, $entityId, 2025, [
            'prior_year_op_carryover' => 200,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleC');
        $priorYearFacts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024, 'scheduleC');

        $this->assertSame(200.0, $facts['scheduleC']['homeOfficePriorCarryforward']);
        $this->assertSame(300.0, $facts['scheduleC']['homeOfficeAllowable']);
        $this->assertSame(0.0, $facts['scheduleC']['homeOfficeDisallowed']);
        $this->assertSame(700.0, $facts['scheduleC']['netProfit']);
        $priorYearHomeOfficeSources = collect($priorYearFacts['scheduleC']['entities'][0]['homeOfficeSources']);
        $this->assertSame(500.0, $priorYearHomeOfficeSources->firstWhere('sourceType', 'form_8829_home_office_expense')['amount']);
        $this->assertSame(-200.0, $priorYearHomeOfficeSources->firstWhere('sourceType', 'schedule_c_home_office_disallowed')['amount']);
        $this->assertSame(300.0, $priorYearHomeOfficeSources->sum('amount'));
    }

    public function test_form_8829_regular_method_applies_inputs_and_feeds_schedule_c_line_30(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Home Office LLC');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $homeOfficeTag = $this->createScheduleCTag($user->id, $entityId, 'scho_rent', 'Home office rent');

        $this->tagTransaction($account->acct_id, $incomeTag, '2025-01-01', 10000);
        $this->tagTransaction($account->acct_id, $homeOfficeTag, '2025-02-01', -12000);
        $this->createForm8829Input($user->id, $entityId, 2025, [
            'office_sqft' => 150,
            'home_sqft' => 1200,
            'prior_year_op_carryover' => 12738,
            'prior_year_op_carryover_ca' => 200,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);
        $form8829Entity = $facts['form8829']['entities'][0];

        $this->assertSame(12.5, $form8829Entity['businessUsePercentage']);
        $this->assertSame(1500.0, $form8829Entity['line25AllowableIndirectExpenses']);
        $this->assertSame(10000.0, $form8829Entity['line36AllowableHomeOfficeDeduction']);
        $this->assertSame(4238.0, $form8829Entity['line43CarryoverToNextYear']);
        $this->assertSame(10000.0, $facts['scheduleC']['homeOfficeAllowable']);
        $this->assertSame(0.0, $facts['scheduleC']['netProfit']);
    }

    public function test_schedule_c_positive_expense_rows_are_flagged_and_excluded(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Rent Review LLC');
        $expenseTag = $this->createScheduleCTag($user->id, $entityId, 'sce_rent_property', 'Rent');

        $this->tagTransaction($account->acct_id, $expenseTag, '2025-01-01', -43200);
        $this->tagTransaction($account->acct_id, $expenseTag, '2025-02-01', 3600);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleC');
        $entity = $facts['scheduleC']['entities'][0];

        $this->assertSame(43200.0, $entity['expenses']);
        $this->assertSame(43200.0, $facts['scheduleC']['expensesTotal']);
        $this->assertCount(1, $entity['flaggedExpenseRows']);
        $this->assertSame(3600.0, $entity['flaggedExpenseRows'][0]['amount']);
    }

    public function test_schedule_c_line_override_replaces_computed_value_and_adds_source(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Override LLC');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');

        $this->tagTransaction($account->acct_id, $incomeTag, '2025-01-01', 10000);
        DB::table('fin_tax_line_adjustments')->insert([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form' => 'schedule_c',
            'entity_id' => $entityId,
            'line_ref' => 'line_31',
            'kind' => 'override',
            'amount' => 9000,
            'description' => 'Filed return override.',
            'status' => 'applied',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(9000.0, $facts['scheduleC']['netProfit']);
        $this->assertSame(9000.0, $facts['schedule1']['line3Total']);
    }

    public function test_schedule_se_uses_schedule_c_k1_and_w2_inputs_and_feeds_schedule1_line15(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'SE Business');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-02-01', 10000);
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 150000, 'box3_ss_wages' => 150000, 'box5_medicare_wages' => 150000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'SE Fund'],
                codes: ['14' => [
                    ['code' => 'A', 'value' => '20000'],
                    ['code' => 'C', 'value' => '5000'],
                ]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(35000.0, $facts['scheduleSE']['netEarningsFromSE']);
        $this->assertSame(26100.0, $facts['scheduleSE']['remainingSocialSecurityWageBase']);
        $this->assertSame(26100.0, $facts['scheduleSE']['socialSecurityTaxableEarnings']);
        $this->assertSame($facts['scheduleSE']['deductibleSeTax'], $facts['schedule1']['line15Total']);
        $this->assertSame(10000.0, collect($facts['scheduleSE']['entries'])->firstWhere('sourceType', 'schedule_se_schedule_c')['amount']);
        $this->assertSame('schedule_se_line_1a', collect($facts['scheduleSE']['entries'])->firstWhere('sourceType', 'schedule_se_k1_box_14c')['routing']);
    }

    public function test_schedule_f_flows_to_schedule1_line6_and_schedule_se_line1b(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'schedule_f_gross_income', 12000, 'Farm gross income');
        $this->createUserDeduction($user->id, 'schedule_f_expenses', 5000, 'Farm expenses');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);
        $scheduleFEntry = collect($facts['scheduleSE']['entries'])->firstWhere('sourceType', 'schedule_se_schedule_f');

        $this->assertSame(7000.0, $facts['scheduleF']['netFarmProfit']);
        $this->assertSame(7000.0, $facts['schedule1']['line6Total']);
        $this->assertSame(7000.0, $facts['scheduleSE']['netEarningsFromSE']);
        $this->assertNotNull($scheduleFEntry);
        $this->assertSame(7000.0, $scheduleFEntry['amount']);
        $this->assertSame('schedule_se_line_1b', $scheduleFEntry['routing']);
    }

    public function test_schedule_f_loss_keeps_negative_sign_in_schedule1_and_schedule_se(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'schedule_f_gross_income', 3000, 'Farm gross income');
        $this->createUserDeduction($user->id, 'schedule_f_expenses', 8000, 'Farm expenses');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(-5000.0, $facts['scheduleF']['netFarmProfit']);
        $this->assertSame(-5000.0, $facts['schedule1']['line6Total']);
        $this->assertSame(-5000.0, $facts['scheduleSE']['netEarningsFromSE']);
        $this->assertSame(0.0, $facts['scheduleSE']['seTax']);
    }

    public function test_form4797_manual_facts_feed_schedule1_and_schedule_d(): void
    {
        $ordinaryUser = $this->createUser();
        $this->createUserDeduction($ordinaryUser->id, 'form4797_part_i_1231_loss', 4000, 'Section 1231 loss');
        $this->createUserDeduction($ordinaryUser->id, 'form4797_part_ii_ordinary_gain', 500, 'Ordinary gain');
        $this->createUserDeduction($ordinaryUser->id, 'form4797_part_iii_recapture', 200, 'Recapture');

        $ordinaryFacts = app(TaxPreviewFactsService::class)->arrayForYear($ordinaryUser->id, 2025);

        $this->assertSame(-4000.0, $ordinaryFacts['form4797']['partINet1231']);
        $this->assertSame(-3300.0, $ordinaryFacts['form4797']['netToSchedule1Line4']);
        $this->assertSame(0.0, $ordinaryFacts['form4797']['netToScheduleDLongTerm']);
        $this->assertSame(-3300.0, $ordinaryFacts['schedule1']['line4Total']);

        $capitalUser = $this->createUser();
        $this->createUserDeduction($capitalUser->id, 'form4797_part_i_1231_gain', 6000, 'Section 1231 gain');

        $capitalFacts = app(TaxPreviewFactsService::class)->arrayForYear($capitalUser->id, 2025);

        $this->assertSame(6000.0, $capitalFacts['form4797']['partINet1231']);
        $this->assertSame(0.0, $capitalFacts['form4797']['netToSchedule1Line4']);
        $this->assertSame(6000.0, $capitalFacts['form4797']['netToScheduleDLongTerm']);
        $this->assertSame(0.0, $capitalFacts['schedule1']['line4Total']);
        $this->assertSame(6000.0, $capitalFacts['scheduleD']['line12GainLoss']);
    }

    public function test_form8606_backend_facts_use_manual_basis_and_ira_1099r(): void
    {
        $user = $this->createUser();
        $this->createUserDeduction($user->id, 'form8606_nondeductible_contributions', 7000, 'Nondeductible IRA contribution');
        $this->createUserDeduction($user->id, 'form8606_prior_year_basis', 15000, 'Prior-year IRA basis');
        $this->createUserDeduction($user->id, 'form8606_year_end_fmv', 90000, 'IRA year-end FMV');
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_r',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'IRA Custodian',
                'box1_gross_distribution' => 20000,
                'box2a_taxable_amount' => 20000,
                'box7_distribution_code' => '2',
                'box7_ira_sep_simple' => true,
            ],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8606');

        $this->assertSame(22000.0, $facts['form8606']['line3_totalBasis']);
        $this->assertSame(20000.0, $facts['form8606']['line8_convertedToRoth']);
        $this->assertSame(110000.0, $facts['form8606']['line9_total']);
        $this->assertSame(0.2, $facts['form8606']['line10_proRataRatio']);
        $this->assertSame(4000.0, $facts['form8606']['line11_basisInConversion']);
        $this->assertSame(18000.0, $facts['form8606']['line14_basisCarriedForward']);
        $this->assertSame(16000.0, $facts['form8606']['line18_taxableConversions']);
        $this->assertSame(16000.0, $facts['form8606']['taxableToForm1040Line4b']);
    }

    public function test_form6251_backend_facts_map_k1_amt_items(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AMT Fund'],
                codes: ['17' => [
                    ['code' => 'A', 'value' => '100'],
                    ['code' => 'B', 'value' => '200'],
                    ['code' => 'C', 'value' => '50'],
                    ['code' => 'D', 'value' => '1000'],
                    ['code' => 'E', 'value' => '300'],
                    ['code' => 'F', 'value' => '25'],
                ]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form6251');

        $this->assertSame(15750.0, $facts['form6251']['line2aTaxesOrStandardDeduction']);
        $this->assertSame('standard_deduction', $facts['form6251']['line2aSource']);
        $this->assertSame(50.0, $facts['form6251']['line2dDepletion']);
        $this->assertSame(200.0, $facts['form6251']['line2kDispositionOfProperty']);
        $this->assertSame(100.0, $facts['form6251']['line2lPost1986Depreciation']);
        $this->assertSame(700.0, $facts['form6251']['line2tIntangibleDrillingCosts']);
        $this->assertSame(25.0, $facts['form6251']['line3OtherAdjustments']);
        $this->assertTrue($facts['form6251']['requiresStatementReview']);
    }

    public function test_form1040_slice_aggregates_income_sources_retirement_splits_and_payments(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Day Job', 'box1_wages' => 100000, 'box2_fed_tax' => 9000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Side Employer', 'box1_wages' => 50000, 'box2_fed_tax' => 2000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 100, 'box8_tax_exempt' => 25],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box1a_ordinary' => 200, 'box1b_qualified' => 50],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_r',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'IRA Custodian', 'box1_gross_distribution' => 10000, 'box2a_taxable_amount' => 8000, 'box4_fed_tax' => 1200, 'box7_ira_sep_simple' => true],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_r',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Pension Plan', 'box1_gross_distribution' => 7000, 'box2a_taxable_amount' => 6500, 'box4_fed_tax' => 700, 'box7_ira_sep_simple' => false],
        ]);
        $this->createUserDeduction($user->id, 'schedule3_extension_payment', 500, 'Extension payment');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1040');
        $form1040 = $facts['form1040'];

        $this->assertSame(150000.0, $form1040['line1z']);
        $this->assertCount(2, $form1040['line1zSources']);
        $this->assertSame(25.0, $form1040['line2a']);
        $this->assertSame(100.0, $form1040['line2b']);
        $this->assertSame(50.0, $form1040['line3a']);
        $this->assertSame(200.0, $form1040['line3b']);
        $this->assertSame(10000.0, $form1040['line4a']);
        $this->assertSame(8000.0, $form1040['line4b']);
        $this->assertSame(7000.0, $form1040['line5a']);
        $this->assertSame(6500.0, $form1040['line5b']);
        $this->assertSame(11000.0, $form1040['line25a']);
        $this->assertSame(1900.0, $form1040['line25b']);
        $this->assertSame(12900.0, $form1040['line25d']);
        $this->assertSame(500.0, $form1040['line31']);
        $this->assertSame(13400.0, $form1040['line33']);
    }

    public function test_form1040_line8_includes_1099_g_schedule1_part_i_amounts(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_g',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'State Agency',
                'box1_unemployment' => 1500,
                'box2_state_local_refunds' => 300,
            ],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Prize Payer', 'box3_other_income' => 200],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1040');
        $form1040 = $facts['form1040'];

        $this->assertSame(2000.0, $form1040['line8']);
        $this->assertSame(52000.0, $form1040['line9']);
        $this->assertSame(3, count($form1040['line8Sources']));
    }

    public function test_form1040_line8_equals_schedule1_part_i_total(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $scheduleCEntityId = $this->createEmploymentEntity($user->id, 'Line 8 Schedule C LLC');
        $scheduleCIncomeTag = $this->createScheduleCTag($user->id, $scheduleCEntityId, 'business_income', 'Consulting income');
        $scheduleCExpenseTag = $this->createScheduleCTag($user->id, $scheduleCEntityId, 'sce_office_expenses', 'Office expense');

        $this->tagTransaction($account->acct_id, $scheduleCIncomeTag, '2025-02-01', 1000);
        $this->tagTransaction($account->acct_id, $scheduleCExpenseTag, '2025-03-01', -100);
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_g',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'State Agency',
                'box1_unemployment' => 1500,
                'box2_state_local_refunds' => 300,
            ],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Prize Payer', 'box3_other_income' => 200],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'Partnership', '1' => '600']),
        ]);
        $this->createUserDeduction($user->id, 'form4797_part_ii_ordinary_gain', 400, 'Ordinary gain');
        $this->createUserDeduction($user->id, 'schedule_f_gross_income', 1200, 'Farm gross income');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);
        $form1040 = $facts['form1040'];
        $schedule1 = $facts['schedule1'];

        $expectedLine8 = array_sum([
            $schedule1['line1aTotal'],
            $schedule1['line2aTotal'],
            $schedule1['line3Total'],
            $schedule1['line4Total'],
            $schedule1['line5Total'],
            $schedule1['line6Total'],
            $schedule1['line7Total'],
            $schedule1['line9TotalOtherIncome'],
        ]);

        $this->assertSame(5100.0, $expectedLine8);
        $this->assertSame($expectedLine8, $form1040['line8']);
    }

    public function test_form1040_line12_uses_standard_or_itemized_deduction_by_filing_status(): void
    {
        $singleUser = $this->createUser();
        $this->createTaxDocument($singleUser->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 100000],
        ]);

        $singleFacts = app(TaxPreviewFactsService::class)->arrayForYear($singleUser->id, 2025, 'form1040');

        $this->assertSame('standard_deduction', $singleFacts['form1040']['line12Source']);
        $this->assertSame(15750.0, $singleFacts['form1040']['line12']);

        $itemizedUser = $this->createUser();
        $itemizedUser->forceFill(['marriage_status_by_year' => ['2025' => true]])->save();
        $this->createTaxDocument($itemizedUser->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 100000],
        ]);
        $this->createUserDeduction($itemizedUser->id, 'mortgage_interest', 50000, 'Mortgage interest');

        $itemizedFacts = app(TaxPreviewFactsService::class)->arrayForYear($itemizedUser->id, 2025, 'form1040');

        $this->assertSame('itemized_deductions', $itemizedFacts['form1040']['line12Source']);
        $this->assertSame(50000.0, $itemizedFacts['form1040']['line12']);
    }

    public function test_form1040_line16_uses_federal_brackets_for_supported_years_and_filing_statuses(): void
    {
        $cases = [
            [2023, false, 44725.0, 5147.0],
            [2023, true, 89450.0, 10294.0],
            [2024, false, 47150.0, 5426.0],
            [2024, true, 94300.0, 10852.0],
            [2025, false, 48475.0, 5578.5],
            [2025, true, 96950.0, 11157.0],
            [2026, false, 50400.0, 5800.0],
            [2026, true, 100800.0, 11600.0],
        ];

        foreach ($cases as [$year, $isMarried, $taxableIncome, $expectedTax]) {
            $user = $this->createUser();
            if ($isMarried) {
                $user->forceFill(['marriage_status_by_year' => [(string) $year => true]])->save();
            }

            $standardDeduction = $isMarried
                ? FederalStandardDeduction::marriedFilingJointly($year)
                : FederalStandardDeduction::single($year);
            $this->createTaxDocument($user->id, [
                'tax_year' => $year,
                'form_type' => 'w2',
                'is_reviewed' => true,
                'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => $taxableIncome + $standardDeduction],
            ]);

            $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, $year, 'form1040');

            $this->assertSame($taxableIncome, $facts['form1040']['line15']);
            $this->assertSame($expectedTax, $facts['form1040']['line16']);
        }
    }

    public function test_form1040_line16_uses_qualified_dividend_and_capital_gain_stacking(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 85750],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Broker', 'box1a_ordinary' => 10000, 'box1b_qualified' => 10000, 'box2a_cap_gain' => 20000],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form1040');

        $this->assertSame(100000.0, $facts['form1040']['line15']);
        $this->assertSame('qualified_dividends_capital_gain', $facts['form1040']['line16TaxComputation']);
        $this->assertSame(14814.0, $facts['form1040']['line16']);
    }

    public function test_form1040_carries_amt_to_line17_and_computes_refund_or_balance_due(): void
    {
        $amtUser = $this->createUser();
        $this->createTaxDocument($amtUser->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 1000000],
        ]);
        $this->createTaxDocument($amtUser->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'AMT Fund'],
                codes: ['17' => [['code' => 'F', 'value' => '1000000']]],
            ),
        ]);

        $amtFacts = app(TaxPreviewFactsService::class)->arrayForYear($amtUser->id, 2025, 'form1040');

        $this->assertGreaterThan(0, $amtFacts['form1040']['line17']);

        $refundUser = $this->createUser();
        $this->createTaxDocument($refundUser->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000, 'box2_fed_tax' => 10000],
        ]);
        $refundFacts = app(TaxPreviewFactsService::class)->arrayForYear($refundUser->id, 2025, 'form1040');

        $this->assertGreaterThan(0, $refundFacts['form1040']['line34']);
        $this->assertSame($refundFacts['form1040']['line34'], $refundFacts['form1040']['line35a']);
        $this->assertSame(0.0, $refundFacts['form1040']['line37']);

        $balanceUser = $this->createUser();
        $this->createTaxDocument($balanceUser->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000, 'box2_fed_tax' => 0],
        ]);
        $balanceFacts = app(TaxPreviewFactsService::class)->arrayForYear($balanceUser->id, 2025, 'form1040');

        $this->assertSame(0.0, $balanceFacts['form1040']['line34']);
        $this->assertGreaterThan(0, $balanceFacts['form1040']['line37']);
    }

    public function test_form8582_backend_facts_limit_passive_loss_with_carryforward(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 200000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: [
                'A' => '12-3456789',
                'B' => 'Passive Rental LLC',
                'G' => 'Limited Partner',
                '2' => '-30000',
            ]),
        ]);
        PalCarryforward::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'activity_name' => 'Passive Rental LLC',
            'activity_ein' => '12-3456789',
            'ordinary_carryover' => -5000,
            'short_term_carryover' => 0,
            'long_term_carryover' => 0,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8582');

        $this->assertSame(-30000.0, $facts['form8582']['totalPassiveLoss']);
        $this->assertSame(-5000.0, $facts['form8582']['totalPriorYearUnallowed']);
        $this->assertSame(0.0, $facts['form8582']['rentalAllowance']);
        $this->assertSame(0.0, $facts['form8582']['totalAllowedLoss']);
        $this->assertSame(35000.0, $facts['form8582']['totalSuspendedLoss']);
        $this->assertTrue($facts['form8582']['isLossLimited']);
    }

    public function test_form8995_below_threshold_uses_qbi_component_capped_by_taxable_income(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 100000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '100000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertSame(100000.0, $facts['form8995']['totalQbi']);
        $this->assertSame(20000.0, $facts['form8995']['totalQbiComponent']);
        $this->assertSame(84250.0, $facts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(16850.0, $facts['form8995']['taxableIncomeCap']);
        $this->assertSame(16850.0, $facts['form8995']['deduction']);
        $this->assertFalse($facts['form8995']['aboveThreshold']);
    }

    public function test_form8995_above_threshold_uses_form8995a_w2_ubia_limit(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 450000],
        ]);
        $k1Data = $this->k1Data(fields: ['B' => 'QBI Fund']);
        $k1Data['statementA'] = [
            'qualifiedBusinessIncome' => 100000,
            'w2Wages' => 30000,
            'ubia' => 400000,
            'isSstb' => false,
        ];
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $k1Data,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertTrue($facts['form8995']['aboveThreshold']);
        $this->assertSame([], $facts['form8995']['reviewSources']);
        $this->assertSame(17500.0, $facts['form8995']['form8995A']['entities'][0]['wageUbiaLimit']);
        $this->assertSame(17500.0, $facts['form8995']['form8995A']['totalQualifiedBusinessIncomeComponent']);
        $this->assertSame(17500.0, $facts['form8995']['deduction']);
    }

    public function test_form8995_above_threshold_flags_missing_form8995a_inputs(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 450000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '100000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertTrue($facts['form8995']['aboveThreshold']);
        $this->assertNotNull($facts['form8995']['form8995A']);
        $this->assertCount(1, $facts['form8995']['reviewSources']);
        $this->assertSame('needs_review', $facts['form8995']['reviewSources'][0]['reviewStatus']);
        $this->assertStringContainsString('W-2 wages', $facts['form8995']['reviewSources'][0]['reviewAction']);
    }

    public function test_form8995_uses_1099_div_section199a_and_ignores_current_year_k1_code_aa_704c(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 450000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'Dividend Broker',
                'box1a_ordinary' => 1000,
                'box1b_qualified' => 1000,
                'box5_section_199a' => 1000,
            ],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'Current Year Partnership'],
                codes: ['20' => [[
                    'code' => 'AA',
                    'value' => '-84149',
                    'notes' => 'Section 704(c) information. Already included within the applicable K-1 boxes; do not double-count. Informational only.',
                ]]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $sourceTypes = collect($facts['form8995']['entities'])
            ->flatMap(fn (array $entity): array => $entity['sources'])
            ->pluck('sourceType')
            ->all();

        $this->assertTrue($facts['form8995']['aboveThreshold']);
        $this->assertSame(1000.0, $facts['form8995']['qualifiedReitDividends']);
        $this->assertSame(0.0, $facts['form8995']['qualifiedPtpIncome']);
        $this->assertSame(200.0, $facts['form8995']['reitPtpComponent']);
        $this->assertSame(1000.0, $facts['form8995']['netCapitalGain']);
        $this->assertSame(200.0, $facts['form8995']['form8995A']['qualifiedReitPtpComponent']);
        $this->assertSame(200.0, $facts['form8995']['deduction']);
        $this->assertContains('1099_div_section_199a_dividends', $sourceTypes);
        $this->assertNotContains('form_8995_k1_box_20aa', $sourceTypes);
    }

    public function test_form8995a_nets_qbi_losses_before_total_component(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 450000],
        ]);
        $profitableK1 = $this->k1Data(fields: ['B' => 'Profitable QBI Fund']);
        $profitableK1['statementA'] = [
            'qualifiedBusinessIncome' => 100000,
            'w2Wages' => 100000,
            'ubia' => 0,
            'isSstb' => false,
        ];
        $lossK1 = $this->k1Data(fields: ['B' => 'Loss QBI Fund']);
        $lossK1['statementA'] = [
            'qualifiedBusinessIncome' => -100000,
            'w2Wages' => 0,
            'ubia' => 0,
            'isSstb' => false,
        ];
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $profitableK1,
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $lossK1,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $profitableEntity = collect($facts['form8995']['form8995A']['entities'])->firstWhere('label', 'Profitable QBI Fund');

        $this->assertSame(0.0, $facts['form8995']['totalQbi']);
        $this->assertSame(0.0, $facts['form8995']['form8995A']['totalQualifiedBusinessIncomeComponent']);
        $this->assertSame(0.0, $facts['form8995']['deduction']);
        $this->assertSame(-100000.0, $profitableEntity['qbiLossNettingAdjustment']);
        $this->assertSame(0.0, $profitableEntity['qbiAfterLossNetting']);
    }

    public function test_form8995a_phase_in_reduces_sstb_qbi(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 220000],
        ]);
        $k1Data = $this->k1Data(fields: ['B' => 'SSTB Fund']);
        $k1Data['statementA'] = [
            'qualifiedBusinessIncome' => 100000,
            'w2Wages' => 50000,
            'ubia' => 0,
            'isSstb' => true,
        ];
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $k1Data,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $entity = $facts['form8995']['form8995A']['entities'][0];

        $this->assertTrue($facts['form8995']['aboveThreshold']);
        $this->assertSame(0.861, $entity['applicablePercentage']);
        $this->assertSame(86100.0, $entity['adjustedQbi']);
        $this->assertSame(17220.0, $entity['qualifiedBusinessIncomeComponent']);
    }

    public function test_form8995_above_threshold_nets_qbi_losses_before_computing_deduction(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 450000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Gain Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '100000']]],
            ),
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Loss Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '-100000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertTrue($facts['form8995']['aboveThreshold']);
        $this->assertSame(0.0, $facts['form8995']['totalQbi']);
        $this->assertSame(0.0, $facts['form8995']['totalQbiComponent']);
        $this->assertSame(0.0, $facts['form8995']['deduction']);
        $this->assertSame('needs_review', $facts['form8995']['reviewSources'][0]['reviewStatus']);
    }

    public function test_form8995_taxable_income_before_qbi_uses_itemized_deductions(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 100000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '100000']]],
            ),
        ]);
        $this->createUserDeduction($user->id, 'mortgage_interest', 50000, 'Mortgage interest');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);
        $sliceFacts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertTrue($facts['scheduleA']['shouldItemizeSingle']);
        $this->assertSame(50000.0, $facts['scheduleA']['totalItemizedDeductions']);
        $this->assertSame(50000.0, $facts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(10000.0, $facts['form8995']['taxableIncomeCap']);
        $this->assertSame(10000.0, $facts['form8995']['deduction']);
        $this->assertSame(50000.0, $sliceFacts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(10000.0, $sliceFacts['form8995']['deduction']);
    }

    public function test_form8995_slice_estimates_taxable_income_when_magi_is_not_provided(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '1000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertSame(34250.0, $facts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(1000.0, $facts['form8995']['totalQbi']);
    }

    public function test_form8995_uses_historical_standard_deduction_for_taxable_income_cap(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'tax_year' => 2018,
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 50000],
        ]);
        $this->createTaxDocument($user->id, [
            'tax_year' => 2018,
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '1000']]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2018, 'form8995');

        $this->assertSame(38000.0, $facts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(7600.0, $facts['form8995']['taxableIncomeCap']);
        $this->assertSame(1000.0, $facts['form8995']['totalQbi']);
    }

    public function test_form8995_thresholds_only_fall_back_to_latest_for_future_years(): void
    {
        $this->assertSame(['single' => 0.0, 'mfj' => 0.0], Form8995Facts::thresholds(2017));
        $this->assertSame(['single' => 201750.0, 'mfj' => 403500.0], Form8995Facts::thresholds(2027));
    }

    public function test_form8995_excludes_schedule_e_rental_income_by_default(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_misc',
            'is_reviewed' => true,
            'misc_routing' => 'sch_e',
            'parsed_data' => ['payer_name' => 'Tenant', 'box1_rents' => 50000],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(50000.0, $facts['scheduleE']['miscIncomeTotal']);
        $this->assertSame(0.0, $facts['form8995']['totalQbi']);
        $this->assertNull(collect($facts['form8995']['entities'])->firstWhere('sourceKind', 'schedule_e'));
    }

    public function test_form8995_reduces_schedule_c_qbi_by_deductible_half_se_tax(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'QBI Sole Prop');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-02-01', 100000);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $scheduleCEntity = collect($facts['form8995']['entities'])->firstWhere('sourceKind', 'schedule_c');

        $this->assertNotNull($scheduleCEntity);
        $this->assertEqualsWithDelta(92935.22, $scheduleCEntity['qbiIncome'], 0.01);
        $this->assertEqualsWithDelta(92935.22, $facts['form8995']['totalQbi'], 0.01);
    }

    public function test_form8995_includes_schedule_f_and_allocates_half_se_tax_by_source(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'QBI Sole Prop');
        $incomeTag = $this->createScheduleCTag($user->id, $entityId, 'business_income', 'Business income');
        $this->tagTransaction($account->acct_id, $incomeTag, '2025-02-01', 10000);
        $this->createUserDeduction($user->id, 'schedule_f_gross_income', 15000, 'Farm gross income');
        $this->createUserDeduction($user->id, 'schedule_f_expenses', 5000, 'Farm expenses');

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $scheduleCEntity = collect($facts['form8995']['entities'])->firstWhere('sourceKind', 'schedule_c');
        $scheduleFEntity = collect($facts['form8995']['entities'])->firstWhere('sourceKind', 'schedule_f');

        $this->assertNotNull($scheduleCEntity);
        $this->assertNotNull($scheduleFEntity);
        $this->assertSame(9293.52, $scheduleCEntity['qbiIncome']);
        $this->assertSame(9293.52, $scheduleFEntity['qbiIncome']);
        $this->assertSame(18587.04, $facts['form8995']['totalQbi']);
        $this->assertSame('form_8995_schedule_f_qbi', $scheduleFEntity['sources'][0]['sourceType']);
    }

    public function test_form8995_net_capital_gain_reduces_taxable_income_cap(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 50000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [['code' => 'Z', 'value' => '100000']]],
            ),
        ]);
        $this->createLot($account, [
            'purchase_date' => '2024-01-01',
            'sale_date' => '2025-01-02',
            'cost_basis' => 10000,
            'proceeds' => 50000,
            'is_short_term' => false,
            'form_8949_box' => 'D',
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');

        $this->assertSame(40000.0, $facts['form8995']['netCapitalGain']);
        $this->assertSame(74250.0, $facts['form8995']['taxableIncomeBeforeQbi']);
        $this->assertSame(34250.0, $facts['form8995']['taxableIncomeLessNetCapitalGain']);
        $this->assertSame(6850.0, $facts['form8995']['taxableIncomeCap']);
        $this->assertSame(6850.0, $facts['form8995']['deduction']);
    }

    public function test_form8995_collects_legacy_k1_box20_qbi_reit_and_ptp_codes(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'tax_year' => 2022,
            'form_type' => '1099_int',
            'is_reviewed' => true,
            'parsed_data' => ['payer_name' => 'Bank', 'box1_interest' => 100000],
        ]);
        $this->createTaxDocument($user->id, [
            'tax_year' => 2022,
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(
                fields: ['B' => 'QBI Fund'],
                codes: ['20' => [
                    ['code' => 'Z', 'value' => '100'],
                    ['code' => 'AA', 'value' => '10'],
                    ['code' => 'AB', 'value' => '20'],
                    ['code' => 'AC', 'value' => '30'],
                    ['code' => 'AD', 'value' => '40'],
                ]],
            ),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2022, 'form8995');
        $sourceTypes = collect($facts['form8995']['entities'][0]['sources'])->pluck('sourceType')->all();

        $this->assertSame(100.0, $facts['form8995']['totalQbi']);
        $this->assertSame(40.0, $facts['form8995']['qualifiedReitDividends']);
        $this->assertSame(60.0, $facts['form8995']['qualifiedPtpIncome']);
        $this->assertContains('form_8995_k1_box_20z', $sourceTypes);
        $this->assertContains('form_8995_k1_box_20aa', $sourceTypes);
        $this->assertContains('form_8995_k1_box_20ab', $sourceTypes);
        $this->assertContains('form_8995_k1_box_20ac', $sourceTypes);
        $this->assertContains('form_8995_k1_box_20ad', $sourceTypes);
    }

    public function test_form8995_uses_k1_box20_when_statement_a_value_is_empty(): void
    {
        $user = $this->createUser();
        $k1Data = $this->k1Data(
            fields: ['B' => 'QBI Fund'],
            codes: ['20' => [['code' => 'Z', 'value' => '1000']]],
        );
        $k1Data['statementA'] = ['qualifiedBusinessIncome' => null];
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $k1Data,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'form8995');
        $sourceTypes = collect($facts['form8995']['entities'][0]['sources'])->pluck('sourceType')->all();

        $this->assertSame(1000.0, $facts['form8995']['totalQbi']);
        $this->assertContains('form_8995_k1_box_20z', $sourceTypes);
    }

    public function test_schedule_se_uses_payslips_when_w2_is_not_reviewed_and_parsable(): void
    {
        $user = $this->createUser();
        FinPayslips::withoutEvents(fn (): FinPayslips => FinPayslips::create([
            'uid' => $user->id,
            'period_start' => '2025-06-01',
            'period_end' => '2025-06-15',
            'pay_date' => '2025-06-15',
            'taxable_wages_oasdi' => 50000,
            'taxable_wages_medicare' => 52000,
        ]));
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => false,
            'parsed_data' => ['employer_name' => 'Unreviewed Employer', 'box1_wages' => 180000, 'box3_ss_wages' => 180000, 'box5_medicare_wages' => 180000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'SE Fund'], codes: ['14' => [['code' => 'A', 'value' => '100000']]]),
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleSE');
        $wageSources = collect($facts['scheduleSE']['wageSources']);

        $this->assertSame(50000.0, $facts['scheduleSE']['socialSecurityWages']);
        $this->assertSame(52000.0, $facts['scheduleSE']['medicareWages']);
        $this->assertTrue($wageSources->contains('sourceType', 'schedule_se_payslip_social_security_wages'));
        $this->assertTrue($wageSources->contains('sourceType', 'schedule_se_payslip_medicare_wages'));
        $this->assertFalse($wageSources->contains('sourceType', 'schedule_se_w2_social_security_wages'));
    }

    public function test_schedule_se_additional_medicare_uses_single_and_mfj_thresholds(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Employer', 'box1_wages' => 180000, 'box3_ss_wages' => 180000, 'box5_medicare_wages' => 180000],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'is_reviewed' => true,
            'parsed_data' => $this->k1Data(fields: ['B' => 'SE Fund'], codes: ['14' => [['code' => 'A', 'value' => '100000']]]),
        ]);

        $singleFacts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleSE');
        $user->forceFill(['marriage_status_by_year' => ['2025' => true]])->save();
        $mfjFacts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleSE');

        $this->assertSame(200000.0, $singleFacts['scheduleSE']['additionalMedicareThreshold']);
        $this->assertSame(250000.0, $mfjFacts['scheduleSE']['additionalMedicareThreshold']);
        $this->assertLessThan($singleFacts['scheduleSE']['additionalMedicareTax'], $mfjFacts['scheduleSE']['additionalMedicareTax']);
        $this->assertGreaterThan(0, $mfjFacts['scheduleSE']['additionalMedicareTax']);
    }

    public function test_form8959_wage_additional_medicare_flows_to_form1040_line23(): void
    {
        $user = $this->createUser();
        $this->createTaxDocument($user->id, [
            'form_type' => 'w2',
            'is_reviewed' => true,
            'parsed_data' => ['employer_name' => 'Wage Co', 'box1_wages' => 210000, 'box3_ss_wages' => 168600, 'box5_medicare_wages' => 210000, 'box6_medicare_tax' => 3135],
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);

        $this->assertSame(210000.0, $facts['form8959']['wages']);
        $this->assertSame(200000.0, $facts['form8959']['threshold']);
        $this->assertSame(10000.0, $facts['form8959']['excessWages']);
        $this->assertSame(90.0, $facts['form8959']['additionalTax']);
        $this->assertSame(3135.0, $facts['form8959']['medicareTaxWithheld']);
        $this->assertSame(3045.0, $facts['form8959']['regularMedicareTaxWithholding']);
        $this->assertSame(90.0, $facts['form8959']['additionalMedicareWithholding']);
        $this->assertSame('form_8959_line_1', $facts['form8959']['wageSources'][0]['routing']);
        $this->assertSame('form_8959_line_19', $facts['form8959']['withholdingSources'][0]['routing']);
        $this->assertSame(90.0, $facts['form1040']['line23']);
        $this->assertSame(90.0, $facts['form1040']['line25c']);
        $this->assertSame($facts['form1040']['line22'] + 90.0, $facts['form1040']['line24']);
        $this->assertContains('Form 8959 additional Medicare tax on wages', array_column($facts['form1040']['line23Sources'], 'label'));
        $this->assertContains('Form 8959 additional Medicare tax withholding', array_column($facts['form1040']['line25cSources'], 'label'));
    }

    private function createAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => 'Brokerage',
        ]));
    }

    private function createEmploymentEntity(int $userId, string $displayName): int
    {
        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $userId,
            'display_name' => $displayName,
            'start_date' => '2024-01-01',
            'type' => 'sch_c',
            'is_current' => true,
            'is_spouse' => false,
            'is_hidden' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createScheduleCTag(int $userId, int $entityId, string $taxCharacteristic, string $label): int
    {
        return (int) DB::table('fin_account_tag')->insertGetId([
            'tag_userid' => (string) $userId,
            'tag_color' => '#2563eb',
            'tag_label' => $label,
            'tax_characteristic' => $taxCharacteristic,
            'employment_entity_id' => $entityId,
        ]);
    }

    private function tagTransaction(int $accountId, int $tagId, string $date, float $amount): void
    {
        $transactionId = (int) DB::table('fin_account_line_items')->insertGetId([
            't_account' => $accountId,
            't_date' => $date,
            't_type' => 'Debit',
            't_amt' => $amount,
            't_description' => 'Tagged Schedule C transaction',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('fin_account_line_item_tag_map')->insert([
            't_id' => $transactionId,
            'tag_id' => $tagId,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createForm8829Input(int $userId, int $entityId, int $year, array $overrides = []): void
    {
        DB::table('fin_form_8829_inputs')->insert(array_merge([
            'user_id' => $userId,
            'employment_entity_id' => $entityId,
            'tax_year' => $year,
            'method' => 'regular',
            'office_sqft' => null,
            'home_sqft' => null,
            'months_used' => 12,
            'prior_year_op_carryover' => 0,
            'prior_year_op_carryover_ca' => 0,
            'prior_year_depreciation_carryover' => 0,
            'prior_year_depreciation_carryover_ca' => 0,
            'notes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $costBasis = (float) ($overrides['cost_basis'] ?? 1000);
        $proceeds = isset($overrides['proceeds']) ? (float) $overrides['proceeds'] : null;
        $gain = $proceeds !== null ? $proceeds - $costBasis : null;

        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => $overrides['symbol'] ?? 'AAPL',
            'description' => $overrides['description'] ?? 'Test Stock',
            'quantity' => $overrides['quantity'] ?? 10,
            'purchase_date' => $overrides['purchase_date'] ?? '2025-01-01',
            'sale_date' => $overrides['sale_date'] ?? null,
            'cost_basis' => $costBasis,
            'proceeds' => $proceeds,
            'realized_gain_loss' => $gain,
            'is_short_term' => $overrides['is_short_term'] ?? true,
            'lot_source' => $overrides['lot_source'] ?? 'analyzer',
            'tax_document_id' => $overrides['tax_document_id'] ?? null,
            'form_8949_box' => $overrides['form_8949_box'] ?? 'A',
            'is_covered' => $overrides['is_covered'] ?? true,
            'wash_sale_disallowed' => $overrides['wash_sale_disallowed'] ?? null,
            'open_t_id' => $overrides['open_t_id'] ?? null,
            'close_t_id' => $overrides['close_t_id'] ?? null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createTaxDocument(int $userId, array $overrides): FileForTaxDocument
    {
        return FileForTaxDocument::create(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => '1099_misc',
            'original_filename' => 'tax-doc.pdf',
            'stored_filename' => 'tax-doc.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
        ], $overrides));
    }

    private function createUserDeduction(int $userId, string $category, float $amount, string $description, int $year = 2025): UserDeduction
    {
        return UserDeduction::create([
            'user_id' => $userId,
            'tax_year' => $year,
            'category' => $category,
            'description' => $description,
            'amount' => $amount,
        ]);
    }

    /**
     * @param  array<int|string, string>  $fields
     * @param  array<int|string, array<int, array<string, string>>>  $codes
     * @param  array<int, string>  $warnings
     * @param  array<string, mixed>|null  $k3
     * @param  array<string, mixed>  $k3Elections
     * @return array<string, mixed>
     */
    private function k1Data(array $fields = [], array $codes = [], array $warnings = [], ?array $k3 = null, array $k3Elections = []): array
    {
        $data = [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
            'warnings' => $warnings,
        ];

        if ($k3 !== null) {
            $data['k3'] = $k3;
        }

        if ($k3Elections !== []) {
            $data['k3Elections'] = $k3Elections;
        }

        return $data;
    }
}
