<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Tests for ParseImportJob's multi-account 1099-B import logic:
 * - normalizeDateOrNull
 * - matchAccount
 * - upsertLotsFromBroker
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
    // normalizeDateOrNull
    // ---------------------------------------------------------------------------

    public function test_normalize_date_returns_null_for_various(): void
    {
        $this->assertNull($this->callPrivate('normalizeDateOrNull', 'various'));
        $this->assertNull($this->callPrivate('normalizeDateOrNull', 'VARIOUS'));
        $this->assertNull($this->callPrivate('normalizeDateOrNull', '  various  '));
    }

    public function test_normalize_date_returns_null_for_empty_and_non_string(): void
    {
        $this->assertNull($this->callPrivate('normalizeDateOrNull', ''));
        $this->assertNull($this->callPrivate('normalizeDateOrNull', null));
        $this->assertNull($this->callPrivate('normalizeDateOrNull', 42));
    }

    public function test_normalize_date_passes_through_yyyy_mm_dd(): void
    {
        $this->assertSame('2024-01-15', $this->callPrivate('normalizeDateOrNull', '2024-01-15'));
        $this->assertSame('2023-12-31', $this->callPrivate('normalizeDateOrNull', '2023-12-31'));
    }

    public function test_normalize_date_parses_m_d_y_slash_format(): void
    {
        $this->assertSame('2024-03-15', $this->callPrivate('normalizeDateOrNull', '03/15/2024'));
        $this->assertSame('2024-01-05', $this->callPrivate('normalizeDateOrNull', '1/5/2024'));
    }

    public function test_normalize_date_returns_null_for_unparseable(): void
    {
        $this->assertNull($this->callPrivate('normalizeDateOrNull', 'not-a-date'));
        $this->assertNull($this->callPrivate('normalizeDateOrNull', 'Q1 2024'));
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
    // upsertLotsFromBroker
    // ---------------------------------------------------------------------------

    public function test_upsert_lots_creates_lot_and_sell_line_item(): void
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

        $this->callPrivate('upsertLotsFromBroker', $account->acct_id, $transactions, $taxDocId);

        $lot = FinAccountLot::where('acct_id', $account->acct_id)->where('symbol', 'AAPL')->firstOrFail();
        $this->assertSame(10.0, (float) $lot->quantity);
        $this->assertSame('2024-06-15', $lot->sale_date->format('Y-m-d'));
        $this->assertSame(1800.0, (float) $lot->proceeds);
        $this->assertSame(1500.0, (float) $lot->cost_basis);
        $this->assertSame(300.0, (float) $lot->realized_gain_loss);
        $this->assertSame('1099b', $lot->lot_source);
        $this->assertSame($taxDocId, $lot->tax_document_id);
        $this->assertSame('D', $lot->form_8949_box);
        $this->assertTrue($lot->is_covered);
        $this->assertSame(12.34, (float) $lot->accrued_market_discount);
        $this->assertSame(0.0, (float) $lot->wash_sale_disallowed);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $account->acct_id,
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_date' => '2024-06-15',
            't_source' => '1099b',
        ]);
    }

    public function test_upsert_lots_determines_short_term_from_form_8949_box(): void
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

        $this->callPrivate('upsertLotsFromBroker', $account->acct_id, $shortTermTx, $taxDoc->id);

        $this->assertDatabaseHas('fin_account_lots', [
            'symbol' => 'TSLA',
            'is_short_term' => true,
        ]);
    }

    public function test_upsert_lots_normalizes_string_booleans_from_ai_payload(): void
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

        $this->callPrivate('upsertLotsFromBroker', $account->acct_id, $transactions, $taxDoc->id);

        $lot = FinAccountLot::where('acct_id', $account->acct_id)->where('symbol', 'NVDA')->firstOrFail();
        $this->assertFalse($lot->is_covered);
        $this->assertFalse($lot->is_short_term);
    }

    public function test_upsert_lots_deduplicates_sell_line_items(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity');
        $taxDoc = $this->makeTaxDoc($user->id, 0);

        // Pre-existing sell transaction with the same date/symbol/qty/amount
        FinAccountLineItems::create([
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

        $this->callPrivate('upsertLotsFromBroker', $account->acct_id, $transactions, $taxDoc->id);

        // Lot is created but no duplicate sell line item
        $this->assertDatabaseHas('fin_account_lots', ['symbol' => 'MSFT']);
        $this->assertSame(1, FinAccountLineItems::where('t_account', $account->acct_id)
            ->where('t_symbol', 'MSFT')
            ->where('t_type', 'Sell')
            ->count());
    }

    public function test_upsert_lots_skips_rows_missing_required_fields(): void
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

        $this->callPrivate('upsertLotsFromBroker', $account->acct_id, $transactions, $taxDoc->id);

        $this->assertDatabaseCount('fin_account_lots', 0);
    }

    // ---------------------------------------------------------------------------
    // createMultiAccountTaxDocumentResults (integration)
    // ---------------------------------------------------------------------------

    public function test_create_multi_account_results_creates_links_and_lots(): void
    {
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
