<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class Form8949LotExportTest extends TestCase
{
    public function test_txf_export_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/lots/export-txf', [
            'source' => 'database',
            'scope' => 'all',
            'tax_year' => 2025,
        ]);

        $response->assertUnauthorized();
    }

    public function test_account_document_txf_export_returns_imported_1099b_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity Taxable');
        $document = $this->makeTaxDocument($user->id);
        $link = TaxDocumentAccount::createLink($document->id, $account->acct_id, '1099_b', 2025, isReviewed: true);
        $this->makeLot($account, $document);

        $response = $this->actingAs($user)->post('/api/finance/lots/export-txf', [
            'source' => 'database',
            'scope' => 'account_document',
            'account_id' => $account->acct_id,
            'tax_document_id' => $document->id,
            'account_link_id' => $link->id,
        ]);

        $response->assertOk();
        $response->assertHeader('content-type', 'text/plain; charset=utf-8');
        $response->assertHeader('content-disposition', 'attachment; filename="1099b-lots-2025.txf"');
        $response->assertSeeText('N711', false);
        $response->assertSeeText('PApple Inc.', false);
        $response->assertSeeText('$1250.00', false);
    }

    public function test_account_document_export_uses_matching_payer_data_for_account_link(): void
    {
        $user = $this->createUser();
        $fidelity = $this->makeAccount($user->id, 'Fidelity Taxable');
        $etrade = $this->makeAccount($user->id, 'E-TRADE Taxable');
        $document = $this->makeTaxDocument($user->id);
        $document->update([
            'parsed_data' => [
                [
                    'account_identifier' => 'FID-1111',
                    'account_name' => 'Fidelity Taxable',
                    'form_type' => '1099_b',
                    'tax_year' => 2025,
                    'parsed_data' => [
                        'payer_name' => 'Fidelity Brokerage Services',
                        'payer_tin' => '11-1111111',
                    ],
                ],
                [
                    'account_identifier' => 'ETR-2222',
                    'account_name' => 'E-TRADE Taxable',
                    'form_type' => '1099_b',
                    'tax_year' => 2025,
                    'parsed_data' => [
                        'payer_name' => 'E-TRADE Securities',
                        'payer_tin' => '22-2222222',
                    ],
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($document->id, $fidelity->acct_id, '1099_b', 2025, aiIdentifier: 'FID-1111', aiAccountName: 'Fidelity Taxable');
        $link = TaxDocumentAccount::createLink($document->id, $etrade->acct_id, '1099_b', 2025, aiIdentifier: 'ETR-2222', aiAccountName: 'E-TRADE Taxable');
        $this->makeLot($etrade, $document, ['description' => 'Microsoft']);

        $response = $this->actingAs($user)->post('/api/finance/lots/export-olt-xlsx', [
            'source' => 'database',
            'scope' => 'account_document',
            'account_id' => $etrade->acct_id,
            'tax_document_id' => $document->id,
            'account_link_id' => $link->id,
        ]);

        $response->assertOk();

        $tempPath = tempnam(sys_get_temp_dir(), 'olt-payer-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('E-TRADE Securities', $sheet->getCell('T2')->getValue());
        $this->assertSame('22-2222222', $sheet->getCell('U2')->getValue());
    }

    public function test_all_account_olt_export_returns_combined_template_rows(): void
    {
        $user = $this->createUser();
        $fidelity = $this->makeAccount($user->id, 'Fidelity');
        $etrade = $this->makeAccount($user->id, 'E-TRADE');
        $document = $this->makeTaxDocument($user->id);
        $this->makeLot($fidelity, $document, ['symbol' => 'AAPL', 'description' => 'Apple Inc.', 'form_8949_box' => 'A']);
        $this->makeLot($etrade, $document, ['symbol' => 'MSFT', 'description' => 'Microsoft', 'form_8949_box' => 'D', 'is_short_term' => false]);
        $this->makeLot($etrade, $document, ['symbol' => 'OLD', 'sale_date' => '2024-12-31']);

        $response = $this->actingAs($user)->post('/api/finance/lots/export-olt-xlsx', [
            'source' => 'database',
            'scope' => 'all',
            'tax_year' => 2025,
        ]);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $tempPath = tempnam(sys_get_temp_dir(), 'olt-endpoint-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('OLT Template', $sheet->getTitle());
        $this->assertSame('Description of capital asset', $sheet->getCell('A1')->getValue());
        $this->assertSame('Apple Inc.', $sheet->getCell('A2')->getValue());
        $this->assertSame('Microsoft', $sheet->getCell('A3')->getValue());
        $this->assertNull($sheet->getCell('A4')->getValue());
    }

    public function test_analyzer_txf_export_uses_shared_backend_writer(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->post('/api/finance/lots/export-txf', [
            'source' => 'analyzer',
            'lots' => [[
                'symbol' => 'TSLA',
                'description' => 'Tesla',
                'quantity' => 5,
                'dateAcquired' => '2025-01-01',
                'dateSold' => '2025-03-01',
                'proceeds' => 1000,
                'costBasis' => 800,
                'gainOrLoss' => 200,
                'isShortTerm' => true,
            ]],
        ]);

        $response->assertOk();
        $response->assertSeeText('N712', false);
        $response->assertSeeText('PTesla', false);
    }

    public function test_export_rejects_other_users_account(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();
        $account = $this->makeAccount($owner->id);
        $document = $this->makeTaxDocument($owner->id);

        $response = $this->actingAs($attacker)->postJson('/api/finance/lots/export-txf', [
            'source' => 'database',
            'scope' => 'account_document',
            'account_id' => $account->acct_id,
            'tax_document_id' => $document->id,
        ]);

        $response->assertNotFound();
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeTaxDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'consolidated.pdf',
            'stored_filename' => 'consolidated.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('c', 64),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Fidelity',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'payer_name' => 'Fidelity',
                    'payer_tin' => '12-3456789',
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
            'is_short_term' => true,
            'lot_source' => '1099b',
            'tax_document_id' => $document->id,
            'form_8949_box' => 'B',
            'is_covered' => false,
            'accrued_market_discount' => 0,
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
