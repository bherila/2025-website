<?php

namespace Tests\Feature\Finance;

use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Database\Seeders\Finance\FinanceAccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
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
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
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
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
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

    public function test_json_import_normalizes_broker_wash_sale_treatment(): void
    {
        $payload = [
            'transactions' => [
                [
                    'symbol' => 'GROSS',
                    'description' => 'Broker reports gross gain loss',
                    'quantity' => 1,
                    'purchase_date' => '2025-01-15',
                    'sale_date' => '2025-11-20',
                    'proceeds' => 1000.00,
                    'cost_basis' => 1200.00,
                    'realized_gain_loss' => -200.00,
                    'wash_sale_disallowed' => 50.00,
                    'wash_sale_treatment' => 'gross_of_wash_sales',
                    'is_short_term' => true,
                ],
                [
                    'symbol' => 'BASIS',
                    'description' => 'Broker includes wash sale in basis',
                    'quantity' => 1,
                    'purchase_date' => '2025-01-15',
                    'sale_date' => '2025-11-20',
                    'proceeds' => 1000.00,
                    'cost_basis' => 1200.00,
                    'realized_gain_loss' => -200.00,
                    'wash_sale_disallowed' => 50.00,
                    'wash_sale_treatment' => 'already_reflected_in_cost_basis',
                    'is_short_term' => true,
                ],
            ],
        ];
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 2 lot record(s)')
            ->expectsOutputToContain('Imported: 2 inserted');

        $gross = DB::table('fin_account_lots')->where('symbol', 'GROSS')->first();
        $basis = DB::table('fin_account_lots')->where('symbol', 'BASIS')->first();

        $this->assertNotNull($gross);
        $this->assertEquals(-150.00, $gross->realized_gain_loss);
        $this->assertEquals(50.00, $gross->wash_sale_disallowed);

        $this->assertNotNull($basis);
        $this->assertEquals(-200.00, $basis->realized_gain_loss);
        $this->assertEquals(0.00, $basis->wash_sale_disallowed);
        $this->assertStringContainsString('avoid double-counting', (string) $basis->reconciliation_notes);

        unlink($tmpFile);
    }

    public function test_open_positions_mode_imports_current_lots_without_sale_fields(): void
    {
        Queue::fake();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode([
            'positions' => [
                [
                    'symbol' => 'abc',
                    'description' => 'Open stock-plan lot',
                    'quantity' => 3.5,
                    'purchase_date' => '2026-02-01',
                    'cost_basis' => 350.25,
                    'cost_per_unit' => 100.07142857,
                    'market_value' => 420.50,
                    'snapshot_price' => 120.14285714,
                    'snapshot_date' => '2026-04-30',
                    'lotId' => 'schwab-lot-1',
                ],
            ],
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 1 lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'ABC',
            'sale_date' => null,
            'source' => 'account_derived',
            'lot_origin' => 'statement_position',
            'external_id' => 'schwab-lot-1',
            'market_value' => 420.50,
            'snapshot_date' => '2026-04-30',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_mode_accepts_account_data_camel_case_lot_schema(): void
    {
        Queue::fake();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode([
            'lots' => [
                [
                    'symbol' => 'meta',
                    'quantity' => 2,
                    'purchaseDate' => '08/15/2025',
                    'costBasis' => 1564.26,
                    'costPerUnit' => 782.13,
                    'marketValue' => 1186,
                    'lotPrice' => 593,
                    'lotId' => 'camel-lot-1',
                ],
            ],
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 1 lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'META',
            'purchase_date' => '2025-08-15',
            'cost_basis' => 1564.26,
            'cost_per_unit' => 782.13,
            'market_value' => 1186,
            'snapshot_price' => 593,
            'external_id' => 'camel-lot-1',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_csv_accepts_account_data_camel_case_headers(): void
    {
        Queue::fake();
        $csv = implode("\n", [
            'symbol,quantity,purchaseDate,costBasis,costPerUnit,marketValue,lotPrice,lotId',
            'meta,2,08/15/2025,1564.26,782.13,1186,593,csv-camel-lot-1',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
            '--input-format' => 'csv',
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 1 lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'META',
            'purchase_date' => '2025-08-15',
            'cost_basis' => 1564.26,
            'cost_per_unit' => 782.13,
            'market_value' => 1186,
            'snapshot_price' => 593,
            'external_id' => 'csv-camel-lot-1',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_csv_accepts_title_case_headers(): void
    {
        Queue::fake();
        $csv = implode("\n", [
            'Symbol,Quantity,Purchase Date,Cost Basis,Cost Per Unit,Market Value,Lot Price,Lot ID',
            'meta,2,08/15/2025,1564.26,782.13,1186,593,csv-title-lot-1',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
            '--input-format' => 'csv',
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 1 lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'META',
            'purchase_date' => '2025-08-15',
            'cost_basis' => 1564.26,
            'cost_per_unit' => 782.13,
            'market_value' => 1186,
            'snapshot_price' => 593,
            'external_id' => 'csv-title-lot-1',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_csv_accepts_formatted_amounts(): void
    {
        Queue::fake();
        $csv = implode("\n", [
            'Symbol,Quantity,Purchase Date,Cost Basis,Cost Per Unit,Market Value,Lot Price,Lot ID',
            'meta,2,08/15/2025,"1,564.26","782.13","1,186.00","593.00",csv-formatted-lot-1',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
            '--input-format' => 'csv',
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 1 lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'META',
            'purchase_date' => '2025-08-15',
            'cost_basis' => 1564.26,
            'cost_per_unit' => 782.13,
            'market_value' => 1186,
            'snapshot_price' => 593,
            'external_id' => 'csv-formatted-lot-1',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_mode_dedupes_by_external_id(): void
    {
        Queue::fake();
        $payload = [
            'positions' => [
                ['symbol' => 'ABC', 'quantity' => 1, 'purchase_date' => '2026-02-01', 'cost_basis' => 100, 'lot_id' => 'same-lot'],
            ],
        ];
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', ['--account' => $this->acctId, '--file' => $tmpFile, '--mode' => 'open-positions'])->assertSuccessful();
        $this->artisan('finance:lots-import', ['--account' => $this->acctId, '--file' => $tmpFile, '--mode' => 'open-positions'])->assertSuccessful()
            ->expectsOutputToContain('Imported: 0 inserted, 1 skipped');

        $this->assertSame(1, DB::table('fin_account_lots')
            ->where('acct_id', $this->acctId)
            ->where('external_id', 'same-lot')
            ->count());

        unlink($tmpFile);
    }

    public function test_open_positions_mode_dedupes_externalized_import_against_legacy_lot(): void
    {
        Queue::fake();
        DB::table('fin_account_lots')->insert([
            'acct_id' => $this->acctId,
            'symbol' => 'META',
            'quantity' => 2,
            'purchase_date' => '2025-08-15',
            'sale_date' => null,
            'cost_basis' => 1564.26,
            'proceeds' => null,
            'realized_gain_loss' => null,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_source' => 'statement_position',
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_POSITION,
            'external_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode([
            'positions' => [
                ['symbol' => 'META', 'quantity' => 2, 'purchase_date' => '2025-08-15', 'cost_basis' => 1564.26, 'lot_id' => 'new-external-lot'],
            ],
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
        ])->assertSuccessful()
            ->expectsOutputToContain('Imported: 0 inserted, 1 skipped');

        $this->assertSame(1, DB::table('fin_account_lots')
            ->where('acct_id', $this->acctId)
            ->where('symbol', 'META')
            ->where('purchase_date', '2025-08-15')
            ->where('cost_basis', 1564.26)
            ->count());
        $this->assertDatabaseMissing('fin_account_lots', [
            'acct_id' => $this->acctId,
            'external_id' => 'new-external-lot',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_open_positions_clear_preserves_closed_tax_lots(): void
    {
        Queue::fake();
        $now = now();
        DB::table('fin_account_lots')->insert([
            'acct_id' => $this->acctId,
            'symbol' => 'AAPL',
            'quantity' => 1,
            'purchase_date' => '2025-01-01',
            'sale_date' => '2025-02-01',
            'cost_basis' => 100,
            'proceeds' => 120,
            'realized_gain_loss' => 20,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'lot_source' => 'import_1099b',
            'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('fin_account_lots')->insert([
            'acct_id' => $this->acctId,
            'symbol' => 'MSFT',
            'quantity' => 1,
            'purchase_date' => '2025-03-01',
            'sale_date' => null,
            'cost_basis' => 200,
            'proceeds' => null,
            'realized_gain_loss' => null,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_source' => 'statement_position',
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_POSITION,
            'external_id' => 'old-open-lot',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('fin_account_lots')->insert([
            'acct_id' => $this->acctId,
            'symbol' => 'GOOG',
            'quantity' => 1,
            'purchase_date' => '2025-01-01',
            'sale_date' => '2025-02-01',
            'cost_basis' => 100,
            'proceeds' => 120,
            'realized_gain_loss' => 20,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_source' => 'import',
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode([
            'positions' => [
                ['symbol' => 'ABC', 'quantity' => 1, 'purchase_date' => '2026-02-01', 'cost_basis' => 100, 'lot_id' => 'new-open-lot'],
            ],
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--mode' => 'open-positions',
            '--clear' => true,
        ])->assertSuccessful()
            ->expectsOutputToContain('Cleared 1 existing lot record(s)')
            ->expectsOutputToContain('Imported: 1 inserted');

        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'AAPL',
            'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => 'GOOG',
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
        ]);
        $this->assertDatabaseMissing('fin_account_lots', [
            'acct_id' => $this->acctId,
            'external_id' => 'old-open-lot',
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'external_id' => 'new-open-lot',
        ]);

        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_json_import_dry_run_does_not_write(): void
    {
        Queue::fake();
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode($payload));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--dry-run' => true,
        ])->assertSuccessful()
            ->expectsOutputToContain('Dry-run mode');

        $this->assertDatabaseCount('fin_account_lots', 0);
        Queue::assertNotPushed(LotsMatchJob::class);

        unlink($tmpFile);
    }

    public function test_json_import_clear_removes_existing_before_insert(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
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

    public function test_json_import_clear_queues_matcher_for_deleted_lot_years(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode($payload));
        $userId = (int) User::where('email', 'test@example.com')->value('id');

        $this->artisan('finance:lots-import', ['--account' => $this->acctId, '--file' => $tmpFile])->assertSuccessful();
        $document = $this->createBrokerDocument($userId, $this->acctId, 2025);

        Queue::fake();
        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--clear' => true,
        ])->assertSuccessful();

        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->documentId === (int) $document->document_id,
        );

        unlink($tmpFile);
    }

    public function test_json_import_bulk_matches_existing_open_and_close_transactions(): void
    {
        $now = now();
        $openId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $this->acctId,
            't_date' => '2025-01-15',
            't_type' => 'Buy',
            't_symbol' => 'AAPL',
            't_qty' => 10,
            't_amt' => -2000,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $closeId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $this->acctId,
            't_date' => '2025-11-20',
            't_type' => 'Sell',
            't_symbol' => 'AAPL',
            't_qty' => -10,
            't_amt' => 2350,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode([
            'transactions' => [
                $this->sampleJsonPayload()['transactions'][0],
            ],
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--clear' => true,
        ])->assertSuccessful()
            ->expectsOutputToContain('Imported: 1 inserted');

        $lot = DB::table('fin_account_lots')
            ->where('acct_id', $this->acctId)
            ->where('symbol', 'AAPL')
            ->first();

        $this->assertNotNull($lot);
        $this->assertEquals($openId, $lot->open_t_id);
        $this->assertEquals($closeId, $lot->close_t_id);

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

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.csv';
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

        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.csv';
        file_put_contents($tmpFile, $csv);

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
        ])->assertFailed();

        $this->assertDatabaseCount('fin_account_lots', 0);

        unlink($tmpFile);
    }

    // ── Wealthfront text format ───────────────────────────────────────────────

    public function test_wealthfront_text_import_inserts_covered_lots_and_tax_document_reference(): void
    {
        $userId = (int) User::where('email', 'test@example.com')->value('id');
        $taxDocument = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => '2025 1099 Wealthfront.pdf',
            'stored_filename' => '2025 1099 Wealthfront.pdf',
            's3_path' => 'tax_docs/1/2025 1099 Wealthfront.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1234,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'wealthfront_lots_').'.txt';
        file_put_contents($tmpFile, implode("\n", [
            'Wealthfront Brokerage LLC',
            'SHORT TERM TRANSACTIONS FOR COVERED TAX LOTS (Box 12 is checked)',
            'ABBOTT LABS COM / CUSIP: 002824100 / Symbol:',
            '04/14/25    2.000    255.14',
            'V a r i o u s',
            '262.93    ...    -7.79    Total of 2 transactions',
            'SCHWAB CHARLES CORP COM / CUSIP: 808513105 / Symbol:',
            '04/04/25    5.000    349.54    Various    361.44    11.90 W    0.00    Total of 2 transactions',
            'LONG TERM TRANSACTIONS FOR COVERED TAX LOTS (Box 12 is checked)',
            'AMAZON COM INC COM / CUSIP: 023135106 / Symbol:',
            '03/27/25    1.000    190.00    02/10/24    150.00    ...    40.00    Sale',
        ]));

        $this->artisan('finance:lots-import', [
            '--account' => $this->acctId,
            '--file' => $tmpFile,
            '--input-format' => 'text',
            '--tax-document' => $taxDocument->id,
            '--clear' => true,
        ])->assertSuccessful()
            ->expectsOutputToContain('Parsed 3 lot record(s)')
            ->expectsOutputToContain('Imported: 3 inserted');

        $this->assertDatabaseCount('fin_account_lots', 3);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => '002824100',
            'cusip' => '002824100',
            'purchase_date' => '2025-04-14',
            'form_8949_box' => 'A',
            'is_covered' => 1,
            'document_id' => $taxDocument->document_id,
            'reconciliation_notes' => 'Date acquired reported as Various; purchase_date stores sale_date as a database placeholder.',
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => '808513105',
            'wash_sale_disallowed' => 11.90,
            'realized_gain_loss' => 0.00,
            'document_id' => $taxDocument->document_id,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'acct_id' => $this->acctId,
            'symbol' => '023135106',
            'is_short_term' => 0,
            'form_8949_box' => 'D',
            'document_id' => $taxDocument->document_id,
        ]);

        unlink($tmpFile);
    }

    // ── Validation ────────────────────────────────────────────────────────────

    public function test_rejects_missing_account_flag(): void
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
        file_put_contents($tmpFile, json_encode(['transactions' => []]));

        $this->artisan('finance:lots-import', ['--file' => $tmpFile])
            ->assertFailed();

        unlink($tmpFile);
    }

    public function test_rejects_nonexistent_account(): void
    {
        $payload = $this->sampleJsonPayload();
        $tmpFile = tempnam(sys_get_temp_dir(), 'lots_').'.json';
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

    private function createBrokerDocument(int $userId, int $accountId, int $taxYear): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => $taxYear,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $accountId, '1099_b', $taxYear, isReviewed: true);

        return $document;
    }
}
