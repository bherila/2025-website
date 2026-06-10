<?php

namespace Tests\Feature\Finance;

use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TaxDocumentLotsRebuildEndpointTest extends TestCase
{
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/finance/tax-documents/1/lots-rebuild')
            ->assertUnauthorized();
    }

    public function test_endpoint_is_scoped_to_document_owner(): void
    {
        $owner = $this->createUser();
        $attacker = $this->grantFeatures($this->createUser(), ['finance.tax-documents.manage']);
        $account = $this->makeAccount($owner->id);
        $document = $this->makeBrokerDocument($owner->id, $account);

        $this->actingAs($attacker)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-rebuild")
            ->assertNotFound();
    }

    public function test_endpoint_rebuilds_lots_and_returns_refreshed_tax_facts(): void
    {
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeLot($account, $document, [
            'symbol' => 'STALE',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-rebuild")
            ->assertOk()
            ->assertJsonPath('insertedCount', 1)
            ->assertJsonPath('deletedCount', 1)
            ->assertJsonPath('warnings', [])
            ->assertJsonPath('refreshedTaxFacts.year', 2025)
            ->assertJsonCount(1, 'lotIds')
            ->assertJsonStructure(['refreshedTaxFacts' => ['scheduleD', 'form8949']]);

        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $document->document_id,
            'symbol' => 'AAPL',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'form_8949_box' => 'D',
        ]);
        $this->assertDatabaseMissing('fin_account_lots', ['symbol' => 'STALE']);
        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->documentId === (int) $document->document_id,
        );
    }

    public function test_endpoint_rebuilds_unparsed_status_when_parsed_data_is_usable(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $document->update(['genai_status' => 'failed']);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-rebuild")
            ->assertOk()
            ->assertJsonPath('insertedCount', 1)
            ->assertJsonPath('deletedCount', 0)
            ->assertJsonPath('warnings', []);

        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $document->document_id,
            'symbol' => 'AAPL',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
    }

    public function test_endpoint_refuses_unparsed_document_without_usable_parsed_data(): void
    {
        $user = $this->createUser();
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'pending.pdf',
            'stored_filename' => 'pending.pdf',
            's3_path' => "tax_docs/{$user->id}/pending.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('f', 64),
            'uploaded_by_user_id' => $user->id,
            'genai_status' => 'failed',
            'parsed_data' => null,
        ]);

        $this->actingAs($user)
            ->postJson("/api/finance/tax-documents/{$document->id}/lots-rebuild")
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'not_parsed_without_parsed_data');
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
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => [
                    'payer_name' => 'Synthetic Broker',
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
            'document_id' => $document->document_id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
