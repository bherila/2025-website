<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Database\Seeders\Finance\FinanceAccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceAccountsCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['email' => 'test@example.com']);
        putenv("FINANCE_CLI_USER_ID={$this->user->id}");
        $this->seed(FinanceAccountsSeeder::class);
    }

    protected function tearDown(): void
    {
        putenv('FINANCE_CLI_USER_ID=');
        parent::tearDown();
    }

    public function test_lists_accounts_in_table_format(): void
    {
        $this->artisan('finance:accounts')
            ->assertExitCode(0)
            ->expectsOutputToContain('Demo Checking')
            ->expectsOutputToContain('Demo Savings')
            ->expectsOutputToContain('Demo Brokerage');
    }

    public function test_json_output_contains_expected_keys(): void
    {
        // JSON writes the entire payload in one $this->line() call, so only one
        // expectsOutputToContain can match per doWrite invocation. Check a key
        // that only appears in JSON output (not in the table header row).
        $this->artisan('finance:accounts', ['--format' => 'json'])
            ->assertExitCode(0)
            ->expectsOutputToContain('"acct_name"');
    }

    public function test_excludes_closed_accounts_by_default(): void
    {
        FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $this->user->id)
            ->where('acct_name', 'Demo Savings')
            ->update(['when_closed' => now()]);

        $this->artisan('finance:accounts')
            ->assertExitCode(0)
            ->expectsOutputToContain('Demo Checking')
            ->doesntExpectOutput('Demo Savings');
    }

    public function test_include_closed_flag_shows_closed_accounts(): void
    {
        FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $this->user->id)
            ->where('acct_name', 'Demo Savings')
            ->update(['when_closed' => now()]);

        $this->artisan('finance:accounts', ['--include-closed' => true])
            ->assertExitCode(0)
            ->expectsOutputToContain('Demo Savings');
    }

    public function test_rejects_invalid_format(): void
    {
        $this->artisan('finance:accounts', ['--format' => 'csv'])
            ->assertExitCode(1);
    }
}
