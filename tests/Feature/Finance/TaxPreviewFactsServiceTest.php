<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $this->assertSame(55.0, $facts['form4952']['netInvestmentIncomeBeforeQualifiedDividendElection']);
        $this->assertSame('brokerage_margin_interest', $facts['form4952']['investmentInterestSources'][0]['sourceType']);
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
        $this->assertSame(400.0, $facts['scheduleD']['line3GainLoss']);
        $this->assertSame(75.0, $facts['scheduleD']['line5GainLoss']);
        $this->assertSame(600.0, $facts['scheduleD']['line10GainLoss']);
        $this->assertSame(250.0, $facts['scheduleD']['line12GainLoss']);
        $this->assertSame(30.0, $facts['scheduleD']['line13CapitalGainDistributions']);
        $this->assertSame(475.0, $facts['scheduleD']['line7NetShortTerm']);
        $this->assertSame(1380.0, $facts['scheduleD']['line15NetLongTerm']);
        $this->assertSame(1855.0, $facts['scheduleD']['line16Combined']);
        $this->assertSame(75.0, $facts['scheduleD']['ambiguous11SAmount']);
        $this->assertSame('needs_review_schedule_d_line_5_or_12', $facts['scheduleD']['ambiguous11SSources'][0]['routing']);
    }

    private function createAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => 'Brokerage',
        ]));
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

    /**
     * @param  array<int|string, string>  $fields
     * @param  array<int|string, array<int, array<string, string>>>  $codes
     * @param  array<int, string>  $warnings
     * @return array<string, mixed>
     */
    private function k1Data(array $fields = [], array $codes = [], array $warnings = []): array
    {
        return [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => collect($fields)->map(fn (string $value): array => ['value' => $value])->all(),
            'codes' => $codes,
            'warnings' => $warnings,
        ];
    }
}
