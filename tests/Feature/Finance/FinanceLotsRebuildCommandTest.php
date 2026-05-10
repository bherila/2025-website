<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class FinanceLotsRebuildCommandTest extends TestCase
{
    public function test_lots_rebuild_command_rebuilds_single_document_as_json(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);

        $exitCode = Artisan::call('finance:lots-rebuild', [
            '--tax-document' => $document->id,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame(false, $payload['dryRun']);
        $this->assertSame(1, $payload['documentCount']);
        $this->assertSame(1, $payload['totals']['insertedCount']);
        $this->assertSame(0, $payload['totals']['deletedCount']);
        $this->assertStringContainsString('finance:lots-reconcile --tax-document='.$document->id, $payload['hint']);
        $this->assertDatabaseHas('fin_account_lots', [
            'tax_document_id' => $document->id,
            'symbol' => 'AAPL',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
    }

    public function test_lots_rebuild_command_all_broker_docs_dry_run_does_not_write(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeLot($account, $document, [
            'symbol' => 'STALE',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        $exitCode = Artisan::call('finance:lots-rebuild', [
            '--user' => $user->id,
            '--year' => 2025,
            '--all-broker-docs' => true,
            '--dry-run' => true,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertTrue($payload['dryRun']);
        $this->assertSame(1, $payload['documentCount']);
        $this->assertSame(1, $payload['totals']['insertedCount']);
        $this->assertSame(1, $payload['totals']['deletedCount']);
        $this->assertDatabaseHas('fin_account_lots', [
            'tax_document_id' => $document->id,
            'symbol' => 'STALE',
        ]);
        $this->assertDatabaseMissing('fin_account_lots', [
            'tax_document_id' => $document->id,
            'symbol' => 'AAPL',
        ]);
    }

    public function test_lots_rebuild_command_prints_table_warnings_and_hint(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account, createLink: false);

        $this->artisan('finance:lots-rebuild', [
            '--tax-document' => $document->id,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Doc ID')
            ->expectsOutputToContain('did not resolve to a finance account')
            ->expectsOutputToContain('finance:lots-reconcile --tax-document='.$document->id);
    }

    public function test_lots_rebuild_command_requires_document_or_all_broker_docs(): void
    {
        $this->artisan('finance:lots-rebuild')
            ->assertExitCode(1)
            ->expectsOutputToContain('Pass --tax-document=<id> or --all-broker-docs.');
    }

    public function test_lots_rebuild_command_reports_when_all_broker_docs_selection_is_empty(): void
    {
        $user = $this->createUser();

        $this->artisan('finance:lots-rebuild', [
            '--user' => $user->id,
            '--year' => 2025,
            '--all-broker-docs' => true,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain("No matching 1099-B documents found for user {$user->id}, year 2025.");
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

    private function makeBrokerDocument(int $userId, FinAccounts $account, bool $createLink = true): FileForTaxDocument
    {
        $document = FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'total_proceeds' => 1250,
                    'total_cost_basis' => 1000,
                    'total_realized_gain_loss' => 250,
                    'transactions' => [[
                        'symbol' => 'AAPL',
                        'description' => 'Apple Inc.',
                        'quantity' => 10,
                        'purchase_date' => '2024-01-02',
                        'sale_date' => '2025-02-03',
                        'proceeds' => 1250,
                        'cost_basis' => 1000,
                        'wash_sale_disallowed' => 0,
                        'realized_gain_loss' => 250,
                        'form_8949_box' => 'D',
                        'is_covered' => true,
                        'is_short_term' => false,
                    ]],
                ],
            ]],
        ]);

        if ($createLink) {
            TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: '1234', aiAccountName: 'Brokerage');
        }

        return $document;
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
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'tax_document_id' => $document->id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
