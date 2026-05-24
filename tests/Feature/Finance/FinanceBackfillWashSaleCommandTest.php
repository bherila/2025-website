<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class FinanceBackfillWashSaleCommandTest extends TestCase
{
    public function test_backfill_updates_lots_with_zero_wash_sale_from_parsed_rows(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocumentWithRows($user->id, $account);

        $this->makeLot($account, $document, [
            'description' => 'ACME 100 SH',
            'quantity' => 100,
            'sale_date' => '2025-04-04',
            'wash_sale_disallowed' => 0,
        ]);
        $this->makeLot($account, $document, [
            'description' => 'BETA 50 SH',
            'quantity' => 50,
            'sale_date' => '2025-06-20',
            'wash_sale_disallowed' => 0,
        ]);

        $exitCode = Artisan::call('finance:backfill-wash-sale', [
            '--user' => $user->id,
            '--year' => 2025,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertFalse($payload['dryRun']);
        $this->assertSame(2, $payload['totals']['updatedCount']);
        $this->assertSame(130.0, (float) $payload['totals']['totalWashSale']);

        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $document->document_id,
            'description' => 'ACME 100 SH',
            'wash_sale_disallowed' => 50,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $document->document_id,
            'description' => 'BETA 50 SH',
            'wash_sale_disallowed' => 80,
        ]);
    }

    public function test_backfill_is_idempotent_on_second_run(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocumentWithRows($user->id, $account);

        $this->makeLot($account, $document, [
            'description' => 'ACME 100 SH',
            'quantity' => 100,
            'sale_date' => '2025-04-04',
            'wash_sale_disallowed' => 0,
        ]);

        Artisan::call('finance:backfill-wash-sale', [
            '--user' => $user->id,
            '--year' => 2025,
            '--format' => 'json',
        ]);

        $exitCode = Artisan::call('finance:backfill-wash-sale', [
            '--user' => $user->id,
            '--year' => 2025,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame(0, $payload['totals']['updatedCount']);
        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $document->document_id,
            'description' => 'ACME 100 SH',
            'wash_sale_disallowed' => 50,
        ]);
    }

    public function test_backfill_dry_run_reports_changes_without_writing(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocumentWithRows($user->id, $account);
        $lot = $this->makeLot($account, $document, [
            'description' => 'ACME 100 SH',
            'quantity' => 100,
            'sale_date' => '2025-04-04',
            'wash_sale_disallowed' => 0,
        ]);

        $exitCode = Artisan::call('finance:backfill-wash-sale', [
            '--user' => $user->id,
            '--year' => 2025,
            '--dry-run' => true,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertTrue($payload['dryRun']);
        $this->assertSame(1, $payload['totals']['updatedCount']);
        $this->assertSame(0.0, (float) FinAccountLot::find($lot->lot_id)->wash_sale_disallowed);
    }

    public function test_backfill_skips_lots_that_do_not_match_parsed_rows(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocumentWithRows($user->id, $account);
        $unmatched = $this->makeLot($account, $document, [
            'description' => 'OTHER 25 SH',
            'quantity' => 25,
            'sale_date' => '2025-08-01',
            'wash_sale_disallowed' => 0,
        ]);

        Artisan::call('finance:backfill-wash-sale', [
            '--user' => $user->id,
            '--year' => 2025,
            '--format' => 'json',
        ]);

        $this->assertSame(0.0, (float) FinAccountLot::find($unmatched->lot_id)->wash_sale_disallowed);
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => 'Brokerage',
                'acct_number' => '1234',
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeBrokerDocumentWithRows(int $userId, FinAccounts $account): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', "backfill-{$userId}"),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => $account->acct_number,
                'account_name' => $account->acct_name,
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'total_wash_sale_disallowed' => 130,
                    'transactions' => [
                        [
                            'description' => 'ACME 100 SH',
                            'term' => 'short',
                            'form_8949_box' => 'A',
                            'acquired_date' => '2024-09-12',
                            'disposed_date' => '2025-04-04',
                            'quantity' => 100,
                            'proceeds' => 1000,
                            'cost_basis' => 1200,
                            'wash_sale_loss_disallowed' => 50,
                            'realized_gain_loss' => -200,
                        ],
                        [
                            'description' => 'BETA 50 SH',
                            'term' => 'long',
                            'form_8949_box' => 'D',
                            'acquired_date' => '2022-01-15',
                            'disposed_date' => '2025-06-20',
                            'quantity' => 50,
                            'proceeds' => 2000,
                            'cost_basis' => 2300,
                            'wash_sale_loss_disallowed' => 80,
                            'realized_gain_loss' => -300,
                        ],
                    ],
                ],
            ]],
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'document_id' => $document->document_id,
            'lot_origin' => FinAccountLot::ORIGIN_1099B_DISPOSITION,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
