<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotImportFromParsedDataService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Tests for ParseImportJob's multi-account import logic and service-backed 1099-B lot import:
 * - matchAccount
 * - LotImportFromParsedDataService::importTransactions
 * - createMultiAccountTaxDocumentResults (integration)
 */
class ParseImportJob1099BTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /** Call a private method on a ParseImportJob instance via reflection. */
    private function callPrivate(string $method, mixed ...$args): mixed
    {
        $job = new ParseImportJob(0);
        $ref = new ReflectionMethod($job, $method);
        $ref->setAccessible(true);

        return $ref->invoke($job, ...$args);
    }

    private function makeAccount(int $userId, string $name, ?string $acctNumber = null): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name, $acctNumber) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_number' => $acctNumber,
            ]);
        });
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return Collection<int, FinAccounts>
     */
    private function makeAccountCollection(array $rows): Collection
    {
        return FinAccounts::hydrate($rows);
    }

    private function makeTaxDoc(int $userId, int $genaiJobId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2024,
            'form_type' => 'broker_1099',
            'original_filename' => 'consolidated.pdf',
            'stored_filename' => '2024.01.01 abcde consolidated.pdf',
            's3_path' => "tax_docs/{$userId}/2024.01.01 abcde consolidated.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'genai_job_id' => $genaiJobId,
            'genai_status' => 'processing',
        ]);
    }

    private function makeGenAiJob(int $userId, int $taxDocId, int $taxYear = 2024): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $userId,
            'job_type' => 'tax_form_multi_account_import',
            'file_hash' => str_repeat('b', 64),
            'original_filename' => 'consolidated.pdf',
            's3_path' => "tax_docs/{$userId}/consolidated.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'context_json' => json_encode([
                'tax_document_id' => $taxDocId,
                'tax_year' => $taxYear,
                'accounts' => [],
            ]),
            'status' => 'processing',
        ]);
    }

    // ---------------------------------------------------------------------------
    // matchAccount
    // ---------------------------------------------------------------------------

    public function test_match_account_returns_null_when_identifier_empty(): void
    {
        $accounts = $this->makeAccountCollection([
            ['acct_id' => 1, 'acct_name' => 'Fidelity', 'acct_number' => '12345678'],
        ]);

        $result = $this->callPrivate('matchAccount', ['account_identifier' => '', 'account_name' => 'Fidelity'], $accounts);
        $this->assertNull($result);
    }

    public function test_match_account_exact_number(): void
    {
        $accounts = $this->makeAccountCollection([
            ['acct_id' => 10, 'acct_name' => 'Fidelity', 'acct_number' => 'X65-385336'],
            ['acct_id' => 20, 'acct_name' => 'Wealthfront', 'acct_number' => '8W163GBF'],
        ]);

        $result = $this->callPrivate('matchAccount', ['account_identifier' => 'X65-385336', 'account_name' => ''], $accounts);
        $this->assertSame(10, $result);
    }

    public function test_match_account_last4_unique_match(): void
    {
        $accounts = $this->makeAccountCollection([
            ['acct_id' => 10, 'acct_name' => 'Fidelity', 'acct_number' => '12345678'],
            ['acct_id' => 20, 'acct_name' => 'Wealthfront', 'acct_number' => '87654321'],
        ]);

        // "...5678" should match acct 10 uniquely
        $result = $this->callPrivate('matchAccount', ['account_identifier' => '...5678', 'account_name' => ''], $accounts);
        $this->assertSame(10, $result);
    }

    public function test_match_account_name_overlap_tiebreaker(): void
    {
        // Two accounts share the same last-4; name overlap picks the right one
        $accounts = $this->makeAccountCollection([
            ['acct_id' => 10, 'acct_name' => 'Fidelity Brokerage', 'acct_number' => '11115678'],
            ['acct_id' => 20, 'acct_name' => 'Wealthfront Individual', 'acct_number' => '22225678'],
        ]);

        $result = $this->callPrivate('matchAccount', [
            'account_identifier' => '5678',
            'account_name' => 'Wealthfront Individual',
        ], $accounts);
        $this->assertSame(20, $result);
    }

    public function test_match_account_returns_null_when_no_match(): void
    {
        $accounts = $this->makeAccountCollection([
            ['acct_id' => 10, 'acct_name' => 'Fidelity', 'acct_number' => '12345678'],
        ]);

        $result = $this->callPrivate('matchAccount', [
            'account_identifier' => '9999',
            'account_name' => 'Unknown',
        ], $accounts);
        $this->assertNull($result);
    }

    // ---------------------------------------------------------------------------
    // LotImportFromParsedDataService::importTransactions
    // ---------------------------------------------------------------------------

    public function test_import_transactions_creates_lot_without_synthetic_line_item(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $taxDocId = $taxDoc->id;

        $transactions = [[
            'symbol' => 'AAPL',
            'description' => 'APPLE INC',
            'cusip' => '037833100',
            'quantity' => 10,
            'purchase_date' => '2023-01-10',
            'sale_date' => '2024-06-15',
            'proceeds' => 1800.00,
            'cost_basis' => 1500.00,
            'accrued_market_discount' => 12.34,
            'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 300.00,
            'is_short_term' => false,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'additional_info' => null,
        ]];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, $taxDocId);

        $lot = FinAccountLot::where('acct_id', $account->acct_id)->where('symbol', 'AAPL')->firstOrFail();
        $this->assertSame(10.0, (float) $lot->quantity);
        $this->assertSame('2024-06-15', $lot->sale_date->format('Y-m-d'));
        $this->assertSame(1800.0, (float) $lot->proceeds);
        $this->assertSame(1500.0, (float) $lot->cost_basis);
        $this->assertSame(300.0, (float) $lot->realized_gain_loss);
        $this->assertSame('1099b', $lot->lot_source);
        $this->assertSame('037833100', $lot->cusip);
        $this->assertSame($taxDocId, $lot->tax_document_id);
        $this->assertSame('D', $lot->form_8949_box);
        $this->assertTrue($lot->is_covered);
        $this->assertSame(12.34, (float) $lot->accrued_market_discount);
        $this->assertSame(0.0, (float) $lot->wash_sale_disallowed);

        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $account->acct_id,
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_date' => '2024-06-15',
            't_source' => '1099b',
        ]);
    }

    public function test_import_transactions_normalizes_empty_symbol_to_description_fallback(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $transactions = [[
            'symbol' => '',
            'description' => 'APPLE INC',
            'cusip' => '037833100',
            'quantity' => 10,
            'purchase_date' => '2023-01-10',
            'sale_date' => '2024-06-15',
            'proceeds' => 1800.00,
            'cost_basis' => 1500.00,
            'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 300.00,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'additional_info' => null,
        ]];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, (int) $taxDoc->id);

        $lot = FinAccountLot::where('acct_id', $account->acct_id)->firstOrFail();
        $this->assertSame('APPLE INC', $lot->symbol);
        $this->assertSame('037833100', $lot->cusip);
    }

    public function test_import_transactions_determines_short_term_from_form_8949_box(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $shortTermTx = [[
            'symbol' => 'TSLA', 'description' => 'Tesla', 'cusip' => null,
            'quantity' => 5, 'purchase_date' => '2024-01-01', 'sale_date' => '2024-03-01',
            'proceeds' => 500, 'cost_basis' => 400, 'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 100, 'form_8949_box' => 'A', 'is_covered' => true,
            'additional_info' => null,
        ]];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $shortTermTx, (int) $taxDoc->id);

        $this->assertDatabaseHas('fin_account_lots', [
            'symbol' => 'TSLA',
            'is_short_term' => true,
        ]);
    }

    public function test_import_transactions_normalizes_string_booleans_from_ai_payload(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $transactions = [[
            'symbol' => 'NVDA', 'description' => 'NVIDIA', 'cusip' => null,
            'quantity' => 2, 'purchase_date' => '2024-01-01', 'sale_date' => '2024-03-01',
            'proceeds' => 500, 'cost_basis' => 400, 'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 100, 'form_8949_box' => 'A', 'is_covered' => 'false',
            'is_short_term' => 'false', 'additional_info' => null,
        ]];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, (int) $taxDoc->id);

        $lot = FinAccountLot::where('acct_id', $account->acct_id)->where('symbol', 'NVDA')->firstOrFail();
        $this->assertFalse($lot->is_covered);
        $this->assertFalse($lot->is_short_term);
    }

    public function test_import_transactions_normalizes_explicit_broker_wash_sale_treatments(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Brokerage');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $transactions = [
            [
                'symbol' => 'GROSS', 'description' => 'Gross treatment', 'cusip' => null,
                'quantity' => 1, 'purchase_date' => '2024-01-01', 'sale_date' => '2024-03-01',
                'proceeds' => 1000, 'cost_basis' => 1200, 'wash_sale_disallowed' => 50,
                'wash_sale_treatment' => 'gross_of_wash_sales', 'realized_gain_loss' => -200,
                'form_8949_box' => 'A', 'is_covered' => true,
            ],
            [
                'symbol' => 'BASIS', 'description' => 'Basis treatment', 'cusip' => null,
                'quantity' => 1, 'purchase_date' => '2024-01-01', 'sale_date' => '2024-03-01',
                'proceeds' => 1000, 'cost_basis' => 1200, 'wash_sale_disallowed' => 50,
                'wash_sale_treatment' => 'already_reflected_in_cost_basis', 'realized_gain_loss' => -200,
                'form_8949_box' => 'A', 'is_covered' => true,
            ],
            [
                'symbol' => 'NET', 'description' => 'Net treatment', 'cusip' => null,
                'quantity' => 1, 'purchase_date' => '2024-01-01', 'sale_date' => '2024-03-01',
                'proceeds' => 1000, 'cost_basis' => 1200, 'wash_sale_disallowed' => 50,
                'wash_sale_treatment' => 'already_net_of_wash_sales', 'realized_gain_loss' => -150,
                'form_8949_box' => 'A', 'is_covered' => true,
            ],
        ];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, (int) $taxDoc->id);

        $lots = FinAccountLot::where('acct_id', $account->acct_id)
            ->orderBy('symbol')
            ->get()
            ->keyBy('symbol');

        $this->assertSame(-200.0, (float) $lots['BASIS']->realized_gain_loss);
        $this->assertSame(0.0, (float) $lots['BASIS']->wash_sale_disallowed);
        $this->assertStringContainsString('avoid double-counting', (string) $lots['BASIS']->reconciliation_notes);

        $this->assertSame(-150.0, (float) $lots['GROSS']->realized_gain_loss);
        $this->assertSame(50.0, (float) $lots['GROSS']->wash_sale_disallowed);

        $this->assertSame(-150.0, (float) $lots['NET']->realized_gain_loss);
        $this->assertSame(50.0, (float) $lots['NET']->wash_sale_disallowed);
    }

    public function test_import_transactions_links_existing_sell_line_items(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        // Pre-existing sell transaction with the same date/symbol/qty/amount
        $existingSell = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-06-15',
            't_type' => 'Sell',
            't_symbol' => 'MSFT',
            't_qty' => -5,
            't_amt' => -1000.00,
            't_source' => 'import',
        ]);

        $transactions = [[
            'symbol' => 'MSFT', 'description' => 'Microsoft', 'cusip' => null,
            'quantity' => 5, 'purchase_date' => '2023-06-01', 'sale_date' => '2024-06-15',
            'proceeds' => 1000.00, 'cost_basis' => 800.00, 'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 200.00, 'form_8949_box' => 'D', 'is_covered' => true,
            'additional_info' => null,
        ]];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, (int) $taxDoc->id);

        // Lot is created and linked to the native sell without creating a duplicate transaction.
        $lot = FinAccountLot::where('acct_id', $account->acct_id)->where('symbol', 'MSFT')->firstOrFail();
        $this->assertSame($existingSell->t_id, $lot->close_t_id);
        $this->assertSame(1, FinAccountLineItems::where('t_account', $account->acct_id)
            ->where('t_symbol', 'MSFT')
            ->where('t_type', 'Sell')
            ->count());
    }

    public function test_import_transactions_does_not_reuse_same_sell_line_item_for_duplicate_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $firstSell = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-06-15',
            't_type' => 'Sell',
            't_symbol' => 'MSFT',
            't_qty' => -5,
            't_amt' => 1000.00,
            't_source' => 'import',
        ]);
        $secondSell = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-06-15',
            't_type' => 'Sell',
            't_symbol' => 'MSFT',
            't_qty' => -5,
            't_amt' => 1000.00,
            't_source' => 'import',
        ]);

        $lotRow = [
            'symbol' => 'MSFT', 'description' => 'Microsoft', 'cusip' => null,
            'quantity' => 5, 'purchase_date' => '2023-06-01', 'sale_date' => '2024-06-15',
            'proceeds' => 1000.00, 'cost_basis' => 800.00, 'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 200.00, 'form_8949_box' => 'D', 'is_covered' => true,
            'additional_info' => null,
        ];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, [$lotRow, $lotRow], (int) $taxDoc->id);

        $closeIds = FinAccountLot::where('acct_id', $account->acct_id)
            ->where('symbol', 'MSFT')
            ->orderBy('lot_id')
            ->pluck('close_t_id')
            ->all();

        $this->assertSame([$firstSell->t_id, $secondSell->t_id], $closeIds);
    }

    public function test_import_transactions_skips_rows_missing_required_fields(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        $transactions = [
            // Missing sale_date — should be skipped
            ['symbol' => 'AAPL', 'description' => 'Apple', 'cusip' => null,
                'quantity' => 5, 'purchase_date' => '2023-01-01', 'sale_date' => null,
                'proceeds' => 500, 'cost_basis' => 400, 'wash_sale_disallowed' => 0,
                'realized_gain_loss' => 100, 'form_8949_box' => 'D', 'is_covered' => true,
                'additional_info' => null],
            // Missing quantity — should be skipped
            ['symbol' => 'GOOG', 'description' => 'Google', 'cusip' => null,
                'quantity' => null, 'purchase_date' => '2023-01-01', 'sale_date' => '2024-01-01',
                'proceeds' => 500, 'cost_basis' => 400, 'wash_sale_disallowed' => 0,
                'realized_gain_loss' => 100, 'form_8949_box' => 'D', 'is_covered' => true,
                'additional_info' => null],
        ];

        app(LotImportFromParsedDataService::class)->importTransactions($account->acct_id, $transactions, (int) $taxDoc->id);

        $this->assertDatabaseCount('fin_account_lots', 0);
    }

    // ---------------------------------------------------------------------------
    // createMultiAccountTaxDocumentResults (integration)
    // ---------------------------------------------------------------------------

    public function test_create_multi_account_results_creates_links_and_lots(): void
    {
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity Brokerage', 'X65-385336');

        // Bootstrap the tax doc first (we need its id for the GenAI job context)
        $taxDoc = $this->makeTaxDoc($user->id, 0); // placeholder genai_job_id
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [
            [
                'account_identifier' => 'X65-385336',
                'account_name' => 'Fidelity',
                'form_type' => '1099_div',
                'tax_year' => 2024,
                'parsed_data' => ['box1a_ordinary' => 100.0],
            ],
            [
                'account_identifier' => 'X65-385336',
                'account_name' => 'Fidelity',
                'form_type' => '1099_b',
                'tax_year' => 2024,
                'parsed_data' => [
                    'total_proceeds' => 1800.0,
                    'transactions' => [[
                        'symbol' => 'AAPL', 'description' => 'Apple', 'cusip' => null,
                        'quantity' => 10, 'purchase_date' => '2023-01-10', 'sale_date' => '2024-06-15',
                        'proceeds' => 1800.0, 'cost_basis' => 1500.0, 'wash_sale_disallowed' => 0,
                        'realized_gain_loss' => 300.0, 'form_8949_box' => 'D', 'is_covered' => true,
                        'additional_info' => null,
                    ]],
                ],
            ],
        ];

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);
        $ref->invoke($jobInstance, $genaiJob, $data);

        // Two account links created
        $this->assertDatabaseCount('fin_tax_document_accounts', 2);
        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $taxDoc->id,
            'account_id' => $account->acct_id,
            'form_type' => '1099_div',
            'ai_identifier' => 'X65-385336',
        ]);
        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $taxDoc->id,
            'form_type' => '1099_b',
        ]);

        // One lot created from the 1099-B
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'tax_document_id' => $taxDoc->id,
        ]);

        // Parent doc marked parsed
        $this->assertDatabaseHas('fin_tax_documents', [
            'id' => $taxDoc->id,
            'genai_status' => 'parsed',
        ]);
        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->taxDocumentId === (int) $taxDoc->id,
        );
    }

    public function test_create_multi_account_results_imports_summary_wash_sale_adjustment_when_rows_omit_it(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Morgan Stanley', '367-671847-209');

        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [[
            'account_identifier' => '367-671847-209',
            'account_name' => 'Morgan Stanley',
            'form_type' => '1099_b',
            'tax_year' => 2024,
            'parsed_data' => [
                'total_proceeds' => 1000.0,
                'total_cost_basis' => 1200.0,
                'total_wash_sale_disallowed' => 50.0,
                'total_realized_gain_loss' => -150.0,
                'wash_sale_treatment' => 'gross_of_wash_sales',
                'summary' => [
                    'sections' => [[
                        'name' => 'short_term_covered_box_a',
                        'total_proceeds' => 1000.0,
                        'total_cost_basis' => 1200.0,
                        'total_wash_sales' => 50.0,
                        'realized_gain_loss' => -150.0,
                    ]],
                ],
                'transactions' => [[
                    'symbol' => 'MS',
                    'description' => 'Morgan Stanley lot',
                    'cusip' => null,
                    'quantity' => 1,
                    'purchase_date' => '2024-01-01',
                    'sale_date' => '2024-03-01',
                    'proceeds' => 1000.0,
                    'cost_basis' => 1200.0,
                    'wash_sale_disallowed' => 0.0,
                    'realized_gain_loss' => -200.0,
                    'form_8949_box' => 'A',
                    'is_covered' => true,
                ]],
            ],
        ]];

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);
        $ref->invoke($jobInstance, $genaiJob, $data);

        $this->assertSame(2, FinAccountLot::where('tax_document_id', $taxDoc->id)->count());
        $this->assertSame(50.0, (float) FinAccountLot::where('tax_document_id', $taxDoc->id)->sum('wash_sale_disallowed'));
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $account->acct_id,
            'symbol' => 'WASHSALEADJ',
            'wash_sale_disallowed' => 50,
            'realized_gain_loss' => 50,
            'form_8949_box' => 'A',
        ]);
    }

    public function test_create_multi_account_results_infers_wash_sale_adjustment_treatment_from_row_when_doc_treatment_missing(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Morgan Stanley', '367-671847-209');

        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [[
            'account_identifier' => '367-671847-209',
            'account_name' => 'Morgan Stanley',
            'form_type' => '1099_b',
            'tax_year' => 2024,
            'parsed_data' => [
                // Document-level wash_sale_treatment intentionally omitted; AI extract
                // is partially populated and only the per-row treatment is reliable.
                'total_proceeds' => 1000.0,
                'total_cost_basis' => 1200.0,
                'total_wash_sale_disallowed' => 50.0,
                'total_realized_gain_loss' => -200.0,
                'summary' => [
                    'sections' => [[
                        'name' => 'short_term_covered_box_a',
                        'total_proceeds' => 1000.0,
                        'total_cost_basis' => 1200.0,
                        'total_wash_sales' => 50.0,
                        'realized_gain_loss' => -200.0,
                    ]],
                ],
                'transactions' => [[
                    'symbol' => 'MS',
                    'description' => 'Morgan Stanley lot',
                    'cusip' => null,
                    'quantity' => 1,
                    'purchase_date' => '2024-01-01',
                    'sale_date' => '2024-03-01',
                    'proceeds' => 1000.0,
                    'cost_basis' => 1200.0,
                    'wash_sale_disallowed' => 0.0,
                    'wash_sale_treatment' => 'gross_of_wash_sales',
                    'realized_gain_loss' => -200.0,
                    'form_8949_box' => 'A',
                    'is_covered' => true,
                ]],
            ],
        ]];

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);
        $ref->invoke($jobInstance, $genaiJob, $data);

        $this->assertSame(2, FinAccountLot::where('tax_document_id', $taxDoc->id)->count());
        // Per-row treatment was gross_of_wash_sales, so the synthetic row's normalised
        // realized_gain_loss ends up at +$50 (gross 0 + wash 50) per the same Form 8949
        // math used by the existing doc-level synthesis test above.
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $account->acct_id,
            'symbol' => 'WASHSALEADJ',
            'wash_sale_disallowed' => 50,
            'realized_gain_loss' => 50,
            'form_8949_box' => 'A',
        ]);
    }

    public function test_create_multi_account_results_skips_summary_synthesis_when_broker_says_basis_adjusted(): void
    {
        $user = $this->createUser();
        $this->makeAccount($user->id, 'Fidelity', 'X65-385336');

        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [[
            'account_identifier' => 'X65-385336',
            'account_name' => 'Fidelity',
            'form_type' => '1099_b',
            'tax_year' => 2024,
            'parsed_data' => [
                'total_proceeds' => 1000.0,
                'total_cost_basis' => 1200.0,
                'total_wash_sale_disallowed' => 50.0,
                'total_realized_gain_loss' => -200.0,
                'wash_sale_treatment' => 'already_reflected_in_cost_basis',
                'summary' => [
                    'sections' => [[
                        'name' => 'short_term_covered_box_a',
                        'total_proceeds' => 1000.0,
                        'total_cost_basis' => 1200.0,
                        'total_wash_sales' => 50.0,
                        'realized_gain_loss' => -200.0,
                    ]],
                ],
                'transactions' => [[
                    'symbol' => 'FID',
                    'description' => 'Fidelity lot',
                    'cusip' => null,
                    'quantity' => 1,
                    'purchase_date' => '2024-01-01',
                    'sale_date' => '2024-03-01',
                    'proceeds' => 1000.0,
                    'cost_basis' => 1200.0,
                    'wash_sale_disallowed' => 0.0,
                    'realized_gain_loss' => -200.0,
                    'form_8949_box' => 'A',
                    'is_covered' => true,
                ]],
            ],
        ]];

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);
        $ref->invoke($jobInstance, $genaiJob, $data);

        // Basis-adjusted broker explicitly tells us not to add a Form 8949 W row.
        $this->assertSame(1, FinAccountLot::where('tax_document_id', $taxDoc->id)->count());
        $this->assertDatabaseMissing('fin_account_lots', [
            'tax_document_id' => $taxDoc->id,
            'symbol' => 'WASHSALEADJ',
        ]);
    }

    public function test_create_multi_account_results_skips_entry_with_unrecognized_form_type(): void
    {
        $user = $this->createUser();
        $this->makeAccount($user->id, 'Fidelity', 'X65-385336');

        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [
            [
                'account_identifier' => 'X65-385336',
                'account_name' => 'Fidelity',
                'form_type' => 'not_a_real_form',
                'tax_year' => 2024,
                'parsed_data' => [],
            ],
            [
                'account_identifier' => 'X65-385336',
                'account_name' => 'Fidelity',
                'form_type' => '1099_div',
                'tax_year' => 2024,
                'parsed_data' => ['box1a_ordinary' => 50.0],
            ],
        ];

        \Log::shouldReceive('error')
            ->once()
            ->with('ParseImportJob: unrecognized form_type from AI, skipping entry', \Mockery::subset([
                'raw_form_type' => 'not_a_real_form',
            ]));

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);
        $ref->invoke($jobInstance, $genaiJob, $data);

        // Only the valid entry was persisted — the bad entry is silently dropped
        $this->assertDatabaseCount('fin_tax_document_accounts', 1);
        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $taxDoc->id,
            'form_type' => '1099_div',
        ]);
        $this->assertDatabaseMissing('fin_tax_document_accounts', [
            'form_type' => 'broker_1099',
        ]);
    }

    public function test_create_multi_account_results_is_idempotent_on_reprocess(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity', 'X65-385336');

        $taxDoc = $this->makeTaxDoc($user->id, 0);
        $genaiJob = $this->makeGenAiJob($user->id, $taxDoc->id);
        $taxDoc->update(['genai_job_id' => $genaiJob->id]);

        $data = [[
            'account_identifier' => 'X65-385336',
            'account_name' => 'Fidelity',
            'form_type' => '1099_b',
            'tax_year' => 2024,
            'parsed_data' => [
                'transactions' => [[
                    'symbol' => 'MSFT', 'description' => 'Microsoft', 'cusip' => null,
                    'quantity' => 5, 'purchase_date' => '2023-01-01', 'sale_date' => '2024-03-01',
                    'proceeds' => 800.0, 'cost_basis' => 600.0, 'wash_sale_disallowed' => 0,
                    'realized_gain_loss' => 200.0, 'form_8949_box' => 'D', 'is_covered' => true,
                    'additional_info' => null,
                ]],
            ],
        ]];

        $jobInstance = new ParseImportJob($genaiJob->id);
        $ref = new ReflectionMethod($jobInstance, 'createMultiAccountTaxDocumentResults');
        $ref->setAccessible(true);

        // Run twice to verify idempotency
        $ref->invoke($jobInstance, $genaiJob, $data);
        $ref->invoke($jobInstance, $genaiJob, $data);

        // Exactly one link and one lot — not doubled
        $this->assertSame(1, TaxDocumentAccount::where('tax_document_id', $taxDoc->id)->count());
        $this->assertSame(1, FinAccountLot::where('tax_document_id', $taxDoc->id)->count());
    }
}
