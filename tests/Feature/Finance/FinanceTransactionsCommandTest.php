<?php

namespace Tests\Feature\Finance;

use App\Console\Commands\Finance\FinanceTransactionsCommand;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Database\Seeders\Finance\FinanceAccountsSeeder;
use Database\Seeders\Finance\FinanceTransactionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceTransactionsCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['email' => 'test@example.com']);
        putenv("FINANCE_CLI_USER_ID={$this->user->id}");
        $this->seed(FinanceAccountsSeeder::class);
        $this->seed(FinanceTransactionsSeeder::class);
    }

    protected function tearDown(): void
    {
        FinanceTransactionsCommand::$testStdinOverride = null;
        putenv('FINANCE_CLI_USER_ID=');
        parent::tearDown();
    }

    private function checkingId(): int
    {
        return (int) FinAccounts::withoutGlobalScopes()
            ->where('acct_name', 'Demo Checking')
            ->value('acct_id');
    }

    /** @param array<mixed> $payload */
    private function withPayload(array $payload): void
    {
        FinanceTransactionsCommand::$testStdinOverride = $payload;
    }

    public function test_lists_transactions_in_table_format(): void
    {
        $this->artisan('finance:transactions')
            ->assertExitCode(0)
            ->expectsOutputToContain('t_id');
    }

    public function test_json_output_has_transaction_fields(): void
    {
        // JSON writes the entire payload in one $this->line() call, so only one
        // expectsOutputToContain can match per doWrite invocation. Check a key
        // that only appears in JSON output (not in the table header row).
        $this->artisan('finance:transactions', ['--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"t_date"');
    }

    public function test_toon_output_has_transaction_fields(): void
    {
        $this->artisan('finance:transactions', ['--format' => 'toon'])
            ->assertExitCode(0)
            ->expectsOutputToContain('t_date');
    }

    public function test_filter_by_symbol(): void
    {
        $this->artisan('finance:transactions', ['--symbol' => 'AAPL', '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('AAPL');
    }

    public function test_filter_by_year(): void
    {
        $this->artisan('finance:transactions', ['--year' => '2026'])
            ->assertExitCode(0);
    }

    public function test_filter_by_year_and_month(): void
    {
        $this->artisan('finance:transactions', ['--year' => '2026', '--month' => '1'])
            ->assertExitCode(0);
    }

    public function test_month_without_year_fails(): void
    {
        $this->artisan('finance:transactions', ['--month' => '3'])
            ->assertExitCode(1);
    }

    public function test_rejects_invalid_month_zero(): void
    {
        $this->artisan('finance:transactions', ['--year' => '2026', '--month' => '0'])
            ->assertExitCode(1);
    }

    public function test_rejects_invalid_month_thirteen(): void
    {
        $this->artisan('finance:transactions', ['--year' => '2026', '--month' => '13'])
            ->assertExitCode(1);
    }

    public function test_rejects_invalid_year(): void
    {
        $this->artisan('finance:transactions', ['--year' => '99'])
            ->assertExitCode(1);
    }

    public function test_filter_by_type(): void
    {
        $this->artisan('finance:transactions', ['--type' => 'Buy', '--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"t_type": "Buy"');
    }

    public function test_limit_option(): void
    {
        $this->artisan('finance:transactions', ['--limit' => '3'])
            ->assertExitCode(0)
            ->expectsOutputToContain('3 row(s)');
    }

    public function test_unlimited_with_limit_zero(): void
    {
        $this->artisan('finance:transactions', ['--limit' => '0'])
            ->assertExitCode(0);
    }

    public function test_rejects_invalid_format(): void
    {
        $this->artisan('finance:transactions', ['--format' => 'xml'])
            ->assertExitCode(1);
    }

    public function test_import_option_inserts_and_skips_duplicates(): void
    {
        $payload = [
            'transactions' => [
                [
                    't_date' => '2026-05-01',
                    't_type' => 'deposit',
                    't_amt' => 125.50,
                    't_description' => 'CLI deposit',
                    't_symbol' => null,
                ],
            ],
        ];

        $this->withPayload($payload);
        $this->artisan('finance:transactions', ['--import' => true, '--account' => (string) $this->checkingId()])
            ->assertExitCode(0)
            ->expectsOutputToContain('inserted');

        $this->withPayload($payload);
        $this->artisan('finance:transactions', ['--import' => true, '--account' => (string) $this->checkingId()])
            ->assertExitCode(0)
            ->expectsOutputToContain('skipped_duplicate');

        $this->assertSame(1, FinAccountLineItems::query()
            ->where('t_account', $this->checkingId())
            ->where('t_date', '2026-05-01')
            ->where('t_amt', 125.50)
            ->count());
    }

    public function test_import_option_accepts_genai_account_transaction_shape(): void
    {
        $this->withPayload([
            'accounts' => [
                [
                    'acct_id' => $this->checkingId(),
                    'transactions' => [
                        [
                            'date' => '2026-05-02',
                            'type' => 'Dividend',
                            'amount' => 12.34,
                            'description' => 'Generated dividend',
                            'symbol' => 'msft',
                        ],
                    ],
                ],
            ],
        ]);

        $this->artisan('finance:transactions', ['--import' => true])
            ->assertExitCode(0);

        $this->assertDatabaseHas('fin_account_line_items', [
            't_account' => $this->checkingId(),
            't_date' => '2026-05-02',
            't_type' => 'Dividend',
            't_symbol' => 'MSFT',
        ]);
    }
}
