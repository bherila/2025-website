<?php

namespace Tests\Feature\Finance;

use App\Jobs\LotsMatchJob;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Services\TaxDocument\TaxDocumentCreationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DocumentIngestionServiceTest extends TestCase
{
    public function test_statement_upload_creates_document_account_links_and_document_tagged_lots(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'jan-statement.pdf',
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => [
                    'periodStart' => '2025-01-01T12:00:00Z',
                    'periodEnd' => '2025-01-31T23:59:59Z',
                    'closingBalance' => 1234.56,
                ],
                'statementDetails' => [[
                    'section' => 'Income',
                    'line_item' => 'Dividends',
                    'statement_period_value' => 12.34,
                    'ytd_value' => 12.34,
                    'is_percentage' => false,
                ]],
                'transactions' => [[
                    't_date' => '2025-01-15',
                    't_amt' => 12.34,
                    't_description' => 'Dividend',
                ]],
                'lots' => [[
                    'symbol' => 'AAPL',
                    'quantity' => 10,
                    'purchaseDate' => '2024-01-02',
                    'costBasis' => 1000,
                    'saleDate' => '2025-01-20',
                    'proceeds' => 1200,
                ]],
            ]],
        ]);

        $response->assertCreated();

        $documentId = (int) $response->json('document.id');
        $statementId = (int) $response->json('accounts.0.statement_id');

        $this->assertDatabaseHas('fin_documents', [
            'id' => $documentId,
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'jan-statement.pdf',
        ]);
        $this->assertSame('2025-01-31', substr((string) DB::table('fin_documents')->where('id', $documentId)->value('period_end'), 0, 10));
        $this->assertDatabaseHas('fin_statements', [
            'statement_id' => $statementId,
            'document_id' => $documentId,
            'acct_id' => $accountId,
        ]);
        $this->assertSame('2025-01-31', substr((string) DB::table('fin_statements')->where('statement_id', $statementId)->value('statement_closing_date'), 0, 10));
        $this->assertDatabaseHas('fin_document_accounts', [
            'document_id' => $documentId,
            'account_id' => $accountId,
            'statement_id' => $statementId,
            'payload_kind' => FinDocumentAccount::PAYLOAD_DISPOSITIONS,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $documentId,
            'statement_id' => $statementId,
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
            'symbol' => 'AAPL',
        ]);
    }

    public function test_csv_upload_uses_csv_lot_origin(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Taxable');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_CSV_IMPORT,
            'original_filename' => 'history.csv',
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-02-01'],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [[
                    'symbol' => 'MSFT',
                    'quantity' => 3,
                    'purchaseDate' => '2024-02-01',
                    'costBasis' => 600,
                    'saleDate' => '2025-02-01',
                    'proceeds' => 750,
                ]],
            ]],
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('fin_documents', [
            'id' => $response->json('document.id'),
            'document_kind' => FinDocument::KIND_CSV_IMPORT,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $response->json('document.id'),
            'lot_origin' => FinAccountLot::ORIGIN_CSV_IMPORT,
            'symbol' => 'MSFT',
        ]);
    }

    public function test_statement_upload_reuses_existing_document_for_same_user_file_hash(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $payload = [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'file_hash' => str_repeat('c', 64),
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-03-31', 'closingBalance' => 1000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [[
                    'symbol' => 'AAPL',
                    'quantity' => 1,
                    'purchaseDate' => '2024-01-01',
                    'costBasis' => 100,
                    'saleDate' => '2025-03-01',
                    'proceeds' => 120,
                ]],
            ]],
        ];

        $first = $this->actingAs($user)->postJson('/api/finance/documents', $payload);
        $second = $this->actingAs($user)->postJson('/api/finance/documents', $payload);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertSame($first->json('document.id'), $second->json('document.id'));
        $this->assertSame($first->json('accounts.0.statement_id'), $second->json('accounts.0.statement_id'));
        $this->assertSame(1, FinDocument::query()->where('user_id', $user->id)->where('file_hash', str_repeat('c', 64))->count());
        $this->assertSame(1, DB::table('fin_statements')->where('document_id', $first->json('document.id'))->count());
    }

    public function test_statement_position_lots_do_not_auto_dispatch_matcher_jobs(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-04-30', 'closingBalance' => 2000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [[
                    'symbol' => 'VTI',
                    'quantity' => 5,
                    'purchaseDate' => '2024-01-01',
                    'costBasis' => 500,
                ]],
            ]],
        ]);

        $response->assertCreated();
        $documentId = (int) $response->json('document.id');

        $this->assertDatabaseHas('fin_document_accounts', [
            'document_id' => $documentId,
            'payload_kind' => FinDocumentAccount::PAYLOAD_POSITIONS,
        ]);
        $this->assertDatabaseHas('fin_account_lots', [
            'document_id' => $documentId,
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_POSITION,
            'symbol' => 'VTI',
        ]);
        Queue::assertNotPushed(LotsMatchJob::class);
    }

    public function test_unified_document_schema_has_hard_cutover_columns(): void
    {
        $this->assertFalse(Schema::hasColumn('fin_account_lots', 'tax_document_id'));
        $this->assertFalse(Schema::hasColumn('fin_lot_reconciliation_links', 'tax_document_id'));
        $this->assertFalse(Schema::hasColumn('fin_document_accounts', 'tax_document_id'));
        $this->assertTrue(Schema::hasColumn('fin_account_lots', 'document_id'));
        $this->assertTrue(Schema::hasColumn('fin_lot_reconciliation_links', 'document_id'));
        $this->assertTrue(Schema::hasColumn('fin_document_accounts', 'document_id'));
    }

    public function test_tax_document_creation_creates_unified_document_parent(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $service = app(TaxDocumentCreationService::class);

        $taxDocument = $service->createSingleAccountDocument([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => '1099_b',
            'original_filename' => '1099b.pdf',
            'stored_filename' => '1099b.pdf',
            's3_path' => "tax_docs/{$user->id}/1099b.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1000,
            'file_hash' => str_repeat('b', 64),
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => ['transactions' => []],
        ], [
            'account_id' => $accountId,
            'form_type' => '1099_b',
            'tax_year' => 2025,
        ]);

        $this->assertNotNull($taxDocument->document_id);
        $this->assertDatabaseHas('fin_documents', [
            'id' => $taxDocument->document_id,
            'document_kind' => FinDocument::KIND_TAX_FORM,
            'tax_year' => 2025,
        ]);
        $this->assertDatabaseHas('fin_document_accounts', [
            'document_id' => $taxDocument->document_id,
            'account_id' => $accountId,
            'payload_kind' => FinDocumentAccount::PAYLOAD_DISPOSITIONS,
        ]);
    }

    private function createAccount(int $userId, string $name): int
    {
        $account = FinAccounts::withoutEvents(fn () => FinAccounts::query()->withoutGlobalScopes()->create([
            'acct_owner' => $userId,
            'acct_name' => $name,
            'acct_last_balance' => '0',
        ]));

        return (int) $account->acct_id;
    }
}
