<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\DocumentIngestionService;
use Tests\TestCase;

class TaxYearLotsMatchEndpointTest extends TestCase
{
    public function test_year_match_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/finance/tax-years/2025/lots-match')
            ->assertUnauthorized();
    }

    public function test_year_match_endpoint_runs_matcher_for_reviewed_owned_1099_b_documents(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();
        $account = $this->makeAccount($user->id);
        $otherAccount = $this->makeAccount($otherUser->id, 'Other Brokerage');
        $document = $this->makeBrokerDocument($user->id, $account);
        $unreviewedDocument = $this->makeBrokerDocument($user->id, $account, ['is_reviewed' => false, 'file_hash' => str_repeat('d', 64)]);
        $otherDocument = $this->makeBrokerDocument($otherUser->id, $otherAccount, ['file_hash' => str_repeat('e', 64)]);

        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $this->makeBrokerLot($account, $unreviewedDocument, ['symbol' => 'MSFT']);
        $this->makeAccountLot($account, ['symbol' => 'MSFT']);
        $this->makeBrokerLot($otherAccount, $otherDocument);
        $this->makeAccountLot($otherAccount);

        $this->actingAs($user)
            ->postJson('/api/finance/tax-years/2025/lots-match')
            ->assertOk()
            ->assertJsonPath('tax_year', 2025)
            ->assertJsonPath('document_count', 1)
            ->assertJsonPath('counts.auto_matched', 1)
            ->assertJsonPath('documents.0.tax_document_id', $document->id);

        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'document_id' => $document->document_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);
        $this->assertDatabaseMissing('fin_lot_reconciliation_links', [
            'document_id' => $unreviewedDocument->document_id,
        ]);
        $this->assertDatabaseMissing('fin_lot_reconciliation_links', [
            'document_id' => $otherDocument->document_id,
        ]);
    }

    public function test_year_match_endpoint_returns_empty_result_for_empty_year(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->postJson('/api/finance/tax-years/2025/lots-match')
            ->assertOk()
            ->assertJsonPath('document_count', 0)
            ->assertJsonPath('counts.auto_matched', 0)
            ->assertJsonPath('documents', []);
    }

    public function test_year_match_endpoint_skips_unlinked_tax_documents(): void
    {
        $user = $this->createUser();

        FileForTaxDocument::create([
            'user_id' => $user->id,
            'document_id' => null,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'unlinked-broker-1099.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "tax_docs/{$user->id}/unlinked-broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
        ]);

        $this->actingAs($user)
            ->postJson('/api/finance/tax-years/2025/lots-match')
            ->assertOk()
            ->assertJsonPath('document_count', 0)
            ->assertJsonPath('documents', []);

        $this->assertDatabaseMissing('lot_match_runs', [
            'user_id' => $user->id,
        ]);
    }

    public function test_year_match_endpoint_validates_year_range(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->postJson('/api/finance/tax-years/1800/lots-match')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('year');
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_number' => fake()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeBrokerDocument(int $userId, FinAccounts $account, array $overrides = []): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ], $overrides));

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: '1234', aiAccountName: $account->acct_name);

        return $document;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'document_id' => $document->document_id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeAccountLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
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
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
