<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Database\Seeders\Finance\FinanceAccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinanceLotsImportCommandTest extends TestCase
{
    use RefreshDatabase;

    private int $acctId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create(['email' => 'test@example.com']);
        putenv("FINANCE_CLI_USER_ID={$user->id}");
        $this->seed(FinanceAccountsSeeder::class);

        $this->acctId = (int) FinAccounts::withoutGlobalScopes()
            ->where('acct_name', 'Demo Checking')
            ->value('acct_id');
    }

    protected function tearDown(): void
    {
        putenv('FINANCE_CLI_USER_ID=');
        parent::tearDown();
    }

    // ── --schema ──────────────────────────────────────────────────────────────

    public function test_schema_flag_outputs_format_descriptions(): void
    {
        $this->artisan('finance:lots-import', ['--schema' => true])
            ->assertSuccessful()
            ->expectsOutputToContain('JSON format')
            ->expectsOutputToContain('CSV format')
            ->expectsOutputToContain('TOON format')
            ->expectsOutputToContain('Fidelity pdftotext');
    }

    // ── JSON format ───────────────────────────────────────────────────────────

    public function test_json_import_inserts_lots(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertSuccessful()
          ->expectsOutputToContain('Parsed 3 lot record(s)')
          ->expectsOutputToContain('Imported: 3 inserted');

        $this->assertDatabaseCount('fin_account_lots', 3);

        $lot = DB::table('fin_account_lots')
            ->where('acct_id', $this->acctId)
            ->where('symbol', 'AAPL')
            ->first();

        $this->assertNotNull($lot);
        $this->assertEquals(10, $lot->quantity);
        $this->assertEquals('2025-01-15', $lot->purchase_date);
        $this->assertEquals('2025-11-20', $lot->sale_date);
        $this->assertEquals(2350.00, $lot->proceeds);
        $this->assertEquals(2000.00, $lot->cost_basis);
        $this->assertEquals(350.00, $lot->realized_gain_loss);
        $this->assertEquals(1, $lot->is_short_term);
        $this->assertEquals('import_1099b', $lot->lot_source);

        unlink($tmpFile);
    }

    public function test_json_import_skips_duplicates(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode($payload));

        // First import
        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertSuccessful();
        $this->assertDatabaseCount('fin_account_lots', 3);

        // Second import — all should be skipped
        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertSuccessful()
          ->expectsOutputToContain('Imported: 0 inserted, 3 skipped (duplicate)');

        $this->assertDatabaseCount('fin_account_lots', 3);

        unlink($tmpFile);
    }

    public function test_json_import_dry_run_does_not_write(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--dry-run' => true,
        ])->assertSuccessful()
          ->expectsOutputToContain('Dry-run mode');

        $this->assertDatabaseCount('fin_account_lots', 0);

        unlink($tmpFile);
    }

    public function test_json_import_clear_removes_existing_before_insert(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', ['--account' => $this->acctId, '--file' => $tmpFile])->assertSuccessful();
        $this->assertDatabaseCount('fin_account_lots', 3);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--clear' => true,
        ])->assertSuccessful()
          ->expectsOutputToContain('Cleared 3 existing lot record(s)');

        $this->assertDatabaseCount('fin_account_lots', 3);

        unlink($tmpFile);
    }

    // ── CSV format ────────────────────────────────────────────────────────────

    public function test_csv_import_inserts_lots(): void
    {
        $csv = implode("\n", [
            'symbol,description,quantity,purchase_date,sale_date,proceeds,cost_basis,realized_gain_loss,wash_sale_disallowed,is_short_term',
            'AAPL,"APPLE INC",10,2025-01-15,2025-11-20,2350.00,2000.00,350.00,0.00,true',
            'MSFT,"MICROSOFT CORP",5,2024-03-10,2025-06-15,1500.00,1200.00,300.00,0.00,false',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertSuccessful()
          ->expectsOutputToContain('Parsed 2 lot record(s)')
          ->expectsOutputToContain('Imported: 2 inserted');

        $this->assertDatabaseCount('fin_account_lots', 2);

        $msft = DB::table('fin_account_lots')->where('symbol', 'MSFT')->first();
        $this->assertNotNull($msft);
        $this->assertEquals(0, $msft->is_short_term);

        unlink($tmpFile);
    }

    public function test_csv_import_rejects_missing_required_columns(): void
    {
        $csv = implode("\n", [
            'symbol,quantity,sale_date', // missing: purchase_date, proceeds, cost_basis, realized_gain_loss
            'AAPL,10,2025-11-20',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertFailed();

        $this->assertDatabaseCount('fin_account_lots', 0);

        unlink($tmpFile);
    }

    // ── Validation ────────────────────────────────────────────────────────────

    public function test_rejects_missing_account_flag(): void
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode(['transactions' => []]));

        $this->artisan('finance:lots-import', ['--file' => $tmpFile])
            ->assertFailed();

        unlink($tmpFile);
    }

    public function test_rejects_nonexistent_account(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_') . '.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', [
            '--account' => 99999,
            '--file' => $tmpFile,
        ])->assertFailed();

        unlink($tmpFile);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private function sampleJsonPayload(): array
    {
        return [
            'transactions' => [
                [
                    'symbol' => 'AAPL',
                    'description' => 'APPLE INC COM',
                    'quantity' => 10.0,
                    'purchase_date' => '2025-01-15',
                    'sale_date' => '2025-11-20',
                    'proceeds' => 2350.00,
                    'cost_basis' => 2000.00,
                    'realized_gain_loss' => 350.00,
                    'wash_sale_disallowed' => 0.00,
                    'is_short_term' => true,
                ],
                [
                    'symbol' => 'MSFT',
                    'description' => 'MICROSOFT CORP',
                    'quantity' => 5.0,
                    'purchase_date' => '2024-06-01',
                    'sale_date' => '2025-08-15',
                    'proceeds' => 1800.00,
                    'cost_basis' => 1500.00,
                    'realized_gain_loss' => 300.00,
                    'wash_sale_disallowed' => 0.00,
                    'is_short_term' => true,
                ],
                [
                    'symbol' => 'GOOGL',
                    'description' => 'ALPHABET INC CL A',
                    'quantity' => 2.0,
                    'purchase_date' => '2022-03-10',
                    'sale_date' => '2025-09-05',
                    'proceeds' => 340.00,
                    'cost_basis' => 280.00,
                    'realized_gain_loss' => 60.00,
                    'wash_sale_disallowed' => 0.00,
                    'is_short_term' => false,
                ],
            ],
        ];
    }
}
