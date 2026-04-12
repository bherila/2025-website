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

    public function test_empty_transactions_array_exits_cleanly(): void
    {
        $this->withPayload([
            'account_id' => $this->checkingId,
            'transactions' => [],
        ]);

        $this->artisan('finance:import-transactions')
            ->assertExitCode(1); // empty transactions array is an error per the spec
    }
}
