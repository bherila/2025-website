<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class FinanceLotsReconcileCommandTest extends TestCase
{
    public function test_lots_reconcile_command_outputs_json_report(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);

        $this->artisan('finance:lots-reconcile', [
            '--tax-document' => $document->id,
            '--format' => 'json',
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('"tax_document_id": '.$document->id);
    }

    public function test_lots_reconcile_command_table_and_exit_code_on_drift(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeLot($account, $document, [
            'proceeds' => 900,
            'cost_basis' => 800,
            'realized_gain_loss' => 100,
        ]);

        $this->artisan('finance:lots-reconcile', [
            '--user' => $user->id,
            '--year' => 2025,
            '--exit-code-on-drift' => true,
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('DRIFT');
    }

    public function test_lots_reconcile_command_filters_diagnostics_by_severity(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeLot($account, $document, ['form_8949_box' => null]);
        $this->makeLot($account, $document, [
            'symbol' => 'BBB',
            'description' => 'BBB Inc.',
            'cost_basis' => 150,
            'cost_per_unit' => 150,
            'proceeds' => 200,
            'realized_gain_loss' => 50,
            'form_8949_box' => null,
        ]);

        $exitCode = Artisan::call('finance:lots-reconcile', [
            '--tax-document' => $document->id,
            '--format' => 'json',
            '--severity' => 'error',
        ]);
        $output = Artisan::output();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('"status": "ok"', $output);
        $this->assertStringNotContainsString('box_unset', $output);
    }

    public function test_lots_reconcile_command_rejects_invalid_tax_document_option(): void
    {
        $this->artisan('finance:lots-reconcile', [
            '--tax-document' => 'abc',
        ])
            ->assertExitCode(1)
            ->expectsOutputToContain('--tax-document must be a positive integer.');
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

    private function makeBrokerDocument(int $userId, FinAccounts $account): FileForTaxDocument
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
            'file_hash' => str_repeat('b', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'total_proceeds' => 300,
                    'total_cost_basis' => 200,
                    'total_realized_gain_loss' => 100,
                    'transactions' => [
                        $this->transaction(['symbol' => 'AAA', 'proceeds' => 100, 'cost_basis' => 50, 'realized_gain_loss' => 50]),
                        $this->transaction(['symbol' => 'BBB', 'proceeds' => 200, 'cost_basis' => 150, 'realized_gain_loss' => 50]),
                    ],
                ],
            ]],
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: '1234', aiAccountName: 'Brokerage');

        return $document;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAA',
            'description' => 'AAA Inc.',
            'quantity' => 1,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 50,
            'cost_per_unit' => 50,
            'sale_date' => '2025-02-03',
            'proceeds' => 100,
            'realized_gain_loss' => 50,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'tax_document_id' => $document->id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function transaction(array $overrides): array
    {
        return array_merge([
            'symbol' => 'AAA',
            'description' => 'AAA Inc.',
            'quantity' => 1,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => 100,
            'cost_basis' => 50,
            'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 50,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'is_short_term' => false,
        ], $overrides);
    }
}
