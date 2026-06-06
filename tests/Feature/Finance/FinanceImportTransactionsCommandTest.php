<?php

namespace Tests\Feature\Finance;

use App\Console\Commands\Finance\FinanceImportTransactionsCommand;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Database\Seeders\Finance\FinanceAccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceImportTransactionsCommandTest extends TestCase
{
    use RefreshDatabase;

    private int $checkingId;

    private int $savingsId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create(['email' => 'test@example.com']);
        putenv("FINANCE_CLI_USER_ID={$user->id}");
        $this->seed(FinanceAccountsSeeder::class);

        $this->checkingId = (int) FinAccounts::withoutGlobalScopes()
            ->where('acct_name', 'Demo Checking')
            ->value('acct_id');

        $this->savingsId = (int) FinAccounts::withoutGlobalScopes()
            ->where('acct_name', 'Demo Savings')
            ->value('acct_id');
    }

    protected function tearDown(): void
    {
        FinanceImportTransactionsCommand::$testStdinOverride = null;
        putenv('FINANCE_CLI_USER_ID=');
        parent::tearDown();
    }

    /** @param array<mixed> $payload */
    private function withPayload(array $payload): void
    {
        FinanceImportTransactionsCommand::$testStdinOverride = $payload;
    }

    public function test_schema_flag_outputs_json_schema(): void
    {
        // JSON writes the entire payload in one $this->line() call, so only one
        // expectsOutputToContain can match per doWrite invocation. 'transactions'
        // is a top-level schema key that verifies the JSON schema shape.
        $this->artisan('finance:import-transactions', ['--schema' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('transactions');
    }

    public function test_missing_stdin_returns_error(): void
    {
        FinanceImportTransactionsCommand::$testStdinOverride = null;

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_inserts_valid_transactions(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-05-01', 't_type' => 'deposit', 't_amt' => 1000.00, 't_description' => 'Test deposit'],
                ['t_date' => '2026-05-02', 't_type' => 'payment', 't_amt' => -50.00, 't_description' => 'Test payment'],
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(0);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-05-01',
            't_type' => 'deposit',
        ]);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-05-02',
            't_type' => 'payment',
        ]);
    }

    public function test_dry_run_does_not_insert(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-06-01', 't_type' => 'deposit', 't_amt' => 500.00],
            ],
        ]);

        $this->artisan('finance:import-transactions', ['--dry-run' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('dry-run');

        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-06-01',
        ]);
    }

    public function test_deduplicates_existing_rows(): void
    {
        $payload = [
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-07-01', 't_type' => 'deposit', 't_amt' => 999.00, 't_symbol' => null],
            ],
        ];

        $this->withPayload($payload);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        // Second import with same row — should be skipped
        $this->withPayload($payload);
        $this->artisan('finance:import-transactions')
            ->assertExitCode(0)
            ->expectsOutputToContain('skipped_duplicate');

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-07-01')
            ->where('t_amt', 999.00)
            ->count());
    }

    public function test_rejects_row_missing_required_field(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_type' => 'deposit', 't_amt' => 100.00], // missing t_date
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_rejects_unknown_account(): void
    {
        $this->withPayload([
            'account_id' => 99999,
            'transactions' => [
                ['t_date' => '2026-08-01', 't_type' => 'deposit', 't_amt' => 100.00],
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_per_row_account_overrides_payload_account(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId, // default
            'transactions' => [
                // This row explicitly targets savings
                ['t_account' => $this->savingsId, 't_date' => '2026-09-01', 't_type' => 'transfer', 't_amt' => 200.00],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->savingsId,
            't_date' => '2026-09-01',
        ]);
    }

    public function test_rejects_invalid_format(): void
    {
        $this->withPayload(['transactions' => []]);

        $this->artisan('finance:import-transactions', ['--format' => 'csv'])
            ->assertExitCode(1);
    }

    public function test_rejects_empty_transactions_array(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1); // empty transactions array is an error per the spec
    }

    public function test_rejects_invalid_date_format(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '01/15/2026', 't_type' => 'deposit', 't_amt' => 100.00],
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_rejects_calendar_invalid_date(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-02-30', 't_type' => 'deposit', 't_amt' => 100.00],
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_rejects_non_numeric_amount(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-10-01', 't_type' => 'deposit', 't_amt' => 'not-a-number'],
            ],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1);
    }

    public function test_normalizes_symbol_to_uppercase(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-10-02', 't_type' => 'Buy', 't_amt' => -500.00, 't_symbol' => 'aapl'],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-10-02',
            't_symbol' => 'AAPL',
        ]);
    }

    public function test_dry_run_json_mode_outputs_valid_json(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-11-01', 't_type' => 'deposit', 't_amt' => 300.00],
            ],
        ]);

        $this->artisan('finance:import-transactions', ['--dry-run' => true, '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"dry_run"');

        // Nothing should have been inserted
        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-11-01',
        ]);
    }

    public function test_toon_mode_outputs_summary(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-11-02', 't_type' => 'deposit', 't_amt' => 301.00],
            ],
        ]);

        $this->artisan('finance:import-transactions', ['--dry-run' => true, '--format' => 'toon'])
            ->assertExitCode(0)
            ->expectsOutputToContain('skipped_duplicate');
    }

    public function test_statement_id_is_stripped_from_imported_rows(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-12-01', 't_type' => 'deposit', 't_amt' => 200.00, 'statement_id' => 99999],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-12-01',
        ]);

        $this->assertDatabaseMissing('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-12-01',
            'statement_id' => 99999,
        ]);
    }

    public function test_external_id_dedupes_schwab_stock_plan_split_rows_without_collapsing_distinct_lots(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                [
                    't_date' => '2026-04-15',
                    't_type' => 'Stock Plan Release',
                    't_amt' => 0,
                    't_symbol' => 'ABC',
                    't_qty' => 1.25,
                    't_source' => 'schwab-stock-plan',
                    'lotId' => 'lot-001',
                    'schwabOrderId' => 'order-001',
                    'effective_date' => '2026-04-16',
                ],
                [
                    't_date' => '2026-04-15',
                    't_type' => 'Stock Plan Release',
                    't_amt' => 0,
                    't_symbol' => 'ABC',
                    't_qty' => 2.50,
                    't_source' => 'schwab-stock-plan',
                    'lotId' => 'lot-002',
                    'schwabOrderId' => 'order-001',
                    'effective_date' => '2026-04-16',
                ],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(2, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-15')
            ->where('t_type', 'Stock Plan Release')
            ->where('t_amt', 0)
            ->where('t_symbol', 'ABC')
            ->count());

        $this->assertSame(2, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_source', 'schwab-stock-plan')
            ->whereNotNull('external_id')
            ->distinct('external_id')
            ->count('external_id'));

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId,
            't_date' => '2026-04-15',
            't_date_posted' => '2026-04-16',
            't_qty' => 1.25,
        ]);
    }

    public function test_schwab_fingerprint_includes_transaction_type_and_method(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                [
                    't_date' => '2026-04-15',
                    't_type' => 'Qualified Dividend',
                    't_method' => 'QDV',
                    't_amt' => 12.34,
                    't_symbol' => 'ABC',
                    't_source' => 'schwab-brokerage',
                ],
                [
                    't_date' => '2026-04-15',
                    't_type' => 'Bank Interest',
                    't_method' => 'BKINT',
                    't_amt' => 12.34,
                    't_symbol' => 'ABC',
                    't_source' => 'schwab-brokerage',
                ],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(2, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-15')
            ->where('t_amt', 12.34)
            ->whereNotNull('external_id')
            ->distinct('external_id')
            ->count('external_id'));
    }

    public function test_schwab_fingerprint_preserves_long_identifier_strings(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                [
                    't_date' => '2026-04-16',
                    't_type' => 'Stock Plan Activity',
                    't_amt' => 0,
                    't_symbol' => 'ABC',
                    't_source' => 'schwab-stock-plan',
                    'lotId' => '123456789012345678901',
                ],
                [
                    't_date' => '2026-04-16',
                    't_type' => 'Stock Plan Activity',
                    't_amt' => 0,
                    't_symbol' => 'ABC',
                    't_source' => 'schwab-stock-plan',
                    'lotId' => '123456789012345678902',
                ],
            ],
        ]);

        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(2, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-16')
            ->where('t_type', 'Stock Plan Activity')
            ->whereNotNull('external_id')
            ->distinct('external_id')
            ->count('external_id'));
    }

    public function test_external_id_skips_repeat_import_before_legacy_duplicate_heuristic(): void
    {
        $payload = [
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-20', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker', 'external_id' => 'txn-1'],
                ['t_date' => '2026-04-20', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker', 'external_id' => 'txn-2'],
            ],
        ];

        $this->withPayload($payload);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->withPayload($payload);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(2, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-20')
            ->count());
    }

    public function test_legacy_fallback_dedupe_sees_existing_externalized_rows(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-20', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker', 'external_id' => 'txn-1'],
            ],
        ]);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-20', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker'],
            ],
        ]);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-20')
            ->where('t_type', 'Buy')
            ->where('t_symbol', 'ABC')
            ->count());
    }

    public function test_externalized_import_falls_back_to_existing_legacy_rows_without_external_id(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-21', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker'],
            ],
        ]);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-21', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker', 'external_id' => 'txn-legacy-reimport'],
            ],
        ]);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-21')
            ->where('t_type', 'Buy')
            ->where('t_symbol', 'ABC')
            ->count());
    }

    public function test_mixed_batch_externalized_import_falls_back_to_seen_legacy_rows_without_external_id(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [
                ['t_date' => '2026-04-22', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker'],
                ['t_date' => '2026-04-22', 't_type' => 'Buy', 't_amt' => -10.00, 't_symbol' => 'ABC', 't_source' => 'broker', 'external_id' => 'txn-mixed-reimport'],
            ],
        ]);
        $this->artisan('finance:import-transactions')->assertExitCode(0);

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId)
            ->where('t_date', '2026-04-22')
            ->where('t_type', 'Buy')
            ->where('t_symbol', 'ABC')
            ->count());
    }
}
