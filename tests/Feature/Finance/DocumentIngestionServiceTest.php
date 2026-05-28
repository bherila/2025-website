<?php

namespace Tests\Feature\Finance;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Jobs\LotsMatchJob;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\User;
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
        Queue::fake();

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
        Queue::assertPushed(LotsMatchJob::class, 1);
    }

    public function test_same_file_hash_can_exist_once_per_document_kind(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $sharedHash = str_repeat('d', 64);

        $taxDocument = app(TaxDocumentCreationService::class)->createSingleAccountDocument([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => '1099_b',
            'original_filename' => 'shared.pdf',
            'stored_filename' => 'shared-tax.pdf',
            's3_path' => "tax_docs/{$user->id}/shared-tax.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1000,
            'file_hash' => $sharedHash,
            'uploaded_by_user_id' => $user->id,
            'parsed_data' => ['transactions' => []],
        ], [
            'account_id' => $accountId,
            'form_type' => '1099_b',
            'tax_year' => 2025,
        ]);

        $statement = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'shared.pdf',
            'file_hash' => $sharedHash,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-03-31', 'closingBalance' => 1000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $statement->assertCreated();
        $this->assertNotSame((int) $taxDocument->document_id, (int) $statement->json('document.id'));
        $this->assertSame(2, FinDocument::query()->where('user_id', $user->id)->where('file_hash', $sharedHash)->count());
    }

    public function test_multi_account_statement_document_uses_full_payload_period_range(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $firstAccountId = $this->createAccount($user->id, 'Brokerage');
        $secondAccountId = $this->createAccount($user->id, 'Checking');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'multi.pdf',
            'file_hash' => str_repeat('e', 64),
            'accounts' => [[
                'acct_id' => $firstAccountId,
                'statementInfo' => ['periodStart' => '2025-02-01', 'periodEnd' => '2025-02-28', 'closingBalance' => 1000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ], [
                'acct_id' => $secondAccountId,
                'statementInfo' => ['periodStart' => '2025-01-15', 'periodEnd' => '2025-03-15', 'closingBalance' => 2000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $response->assertCreated();
        $documentId = (int) $response->json('document.id');

        $this->assertSame('2025-01-15', substr((string) DB::table('fin_documents')->where('id', $documentId)->value('period_start'), 0, 10));
        $this->assertSame('2025-03-15', substr((string) DB::table('fin_documents')->where('id', $documentId)->value('period_end'), 0, 10));
        $this->assertSame(2, DB::table('fin_statements')->where('document_id', $documentId)->count());
        $this->assertSame(2, DB::table('fin_document_accounts')->where('document_id', $documentId)->count());
    }

    public function test_uploaded_statement_requires_file_hash_when_s3_key_is_present(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            's3_key' => "fin_documents/{$user->id}/statement/upload.pdf",
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-03-31', 'closingBalance' => 1000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $response->assertJsonValidationErrors('file_hash');
    }

    public function test_documents_index_uses_stable_resource_shape(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');

        $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'resource.pdf',
            'file_hash' => str_repeat('f', 64),
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodStart' => '2025-04-01', 'periodEnd' => '2025-04-30', 'closingBalance' => 1000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ])->assertCreated();

        $response = $this->actingAs($user)->getJson('/api/finance/documents?document_kind=statement');

        $response->assertOk()
            ->assertJsonPath('data.0.document_kind', FinDocument::KIND_STATEMENT)
            ->assertJsonPath('data.0.original_filename', 'resource.pdf')
            ->assertJsonPath('data.0.accounts.0.account_id', $accountId)
            ->assertJsonMissingPath('data.0.file_hash')
            ->assertJsonMissingPath('data.0.download_history');
    }

    public function test_document_download_history_appends_entries(): void
    {
        $user = $this->createUser();
        $document = FinDocument::query()->create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'download.pdf',
        ]);

        $document->recordDownload($user->id);
        $document->recordDownload($user->id);

        $this->assertSame(2, $document->refresh()->download_count);
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
        $this->assertTrue(Schema::hasIndex('fin_documents', 'fin_docs_user_kind_hash_unique'));
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

    public function test_statement_upload_marks_gen_ai_result_and_job_imported_when_ids_threaded(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $job = $this->makeFinanceJob($user);
        $result = $this->makeFinanceResult($job);

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'statement.pdf',
            'gen_ai_job_id' => $job->id,
            'gen_ai_result_id' => $result->id,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-04-30', 'closingBalance' => 500],
                'statementDetails' => [],
                'transactions' => [[
                    't_date' => '2025-04-15',
                    't_amt' => 50,
                    't_description' => 'Dividend',
                ]],
                'lots' => [],
            ]],
        ]);

        $response->assertCreated();
        $this->assertSame('imported', $result->fresh()->status);
        $this->assertSame('imported', $job->fresh()->status);
    }

    public function test_statement_upload_ignores_gen_ai_ids_owned_by_another_user(): void
    {
        Queue::fake();

        $owner = $this->createUser();
        $other = $this->createUser();
        $accountId = $this->createAccount($other->id, 'Brokerage');
        $job = $this->makeFinanceJob($owner);
        $result = $this->makeFinanceResult($job);

        $response = $this->actingAs($other)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'gen_ai_job_id' => $job->id,
            'gen_ai_result_id' => $result->id,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-04-30', 'closingBalance' => 500],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $response->assertCreated();
        $this->assertSame('pending_review', $result->fresh()->status);
        $this->assertNotSame('imported', $job->fresh()->status);
    }

    public function test_statement_upload_without_gen_ai_ids_leaves_no_side_effects(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $job = $this->makeFinanceJob($user);
        $result = $this->makeFinanceResult($job);

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-04-30', 'closingBalance' => 500],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $response->assertCreated();
        $this->assertSame('pending_review', $result->fresh()->status);
        $this->assertSame('parsed', $job->fresh()->status);
    }

    public function test_statement_upload_rejects_missing_result_id_when_job_id_given(): void
    {
        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $job = $this->makeFinanceJob($user);

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'gen_ai_job_id' => $job->id,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-04-30', 'closingBalance' => 500],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['gen_ai_result_id']);
    }

    public function test_document_delete_cascades_lots_and_account_links(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');
        $fileHash = str_repeat('a', 64);

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'to-delete.pdf',
            'file_hash' => $fileHash,
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-03-31', 'closingBalance' => 100],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [[
                    'symbol' => 'MSFT',
                    'quantity' => 5,
                    'purchaseDate' => '2024-03-01',
                    'costBasis' => 500,
                    'saleDate' => '2025-03-15',
                    'proceeds' => 600,
                ]],
            ]],
        ]);

        $response->assertCreated();
        $documentId = (int) $response->json('document.id');

        $this->assertDatabaseHas('fin_documents', ['id' => $documentId]);
        $this->assertDatabaseHas('fin_account_lots', ['document_id' => $documentId]);

        $previewResponse = $this->actingAs($user)->getJson("/api/finance/documents/{$documentId}/impact-preview");
        $previewResponse->assertOk()
            ->assertJsonPath('summary.document_id', $documentId)
            ->assertJsonPath('summary.user_id', $user->id)
            ->assertJsonPath('summary.lots', 1)
            ->assertJsonPath('summary.account_links', 1)
            ->assertJsonPath('summary.statements', 1)
            ->assertJsonStructure(['summary', 'impact_hash']);

        $impactHash = (string) $previewResponse->json('impact_hash');
        $this->assertNotSame('', $impactHash);
        $this->assertDatabaseHas('fin_documents', ['id' => $documentId]);

        $staleHashResponse = $this->actingAs($user)->deleteJson("/api/finance/documents/{$documentId}", [
            'impact_hash' => str_repeat('0', 64),
        ]);
        $staleHashResponse->assertStatus(409);
        $this->assertDatabaseHas('fin_documents', ['id' => $documentId]);

        $deleteResponse = $this->actingAs($user)->deleteJson("/api/finance/documents/{$documentId}", [
            'impact_hash' => $impactHash,
        ]);
        $deleteResponse->assertOk();

        $this->assertDatabaseMissing('fin_documents', ['id' => $documentId]);
        $this->assertDatabaseMissing('fin_account_lots', ['document_id' => $documentId]);
        $this->assertDatabaseMissing('fin_document_accounts', ['document_id' => $documentId]);
    }

    public function test_document_delete_is_scoped_to_owner_and_rejects_tax_form_documents(): void
    {
        Queue::fake();

        $owner = $this->createUser();
        $attacker = $this->createUser();
        $accountId = $this->createAccount($owner->id, 'Brokerage');

        $response = $this->actingAs($owner)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'private.pdf',
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-01-31', 'closingBalance' => 0],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [],
            ]],
        ]);
        $response->assertCreated();
        $documentId = (int) $response->json('document.id');

        $this->actingAs($attacker)->deleteJson("/api/finance/documents/{$documentId}", [
            'impact_hash' => str_repeat('0', 64),
        ])->assertNotFound();
        $this->assertDatabaseHas('fin_documents', ['id' => $documentId]);

        $taxDocument = app(TaxDocumentCreationService::class)->createSingleAccountDocument([
            'user_id' => $owner->id,
            'tax_year' => 2025,
            'form_type' => '1099_b',
            'original_filename' => 'tax-form.pdf',
            'stored_filename' => 'tax-form.pdf',
            's3_path' => "tax_docs/{$owner->id}/tax-form.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1000,
            'file_hash' => str_repeat('c', 64),
            'uploaded_by_user_id' => $owner->id,
            'parsed_data' => ['transactions' => []],
        ], [
            'account_id' => $accountId,
            'form_type' => '1099_b',
            'tax_year' => 2025,
        ]);

        $this->actingAs($owner)->deleteJson("/api/finance/documents/{$taxDocument->document_id}", [
            'impact_hash' => str_repeat('0', 64),
        ])->assertForbidden();
    }

    public function test_document_source_lineage_position_vs_disposition(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $accountId = $this->createAccount($user->id, 'Brokerage');

        $response = $this->actingAs($user)->postJson('/api/finance/documents', [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'original_filename' => 'mixed.pdf',
            'accounts' => [[
                'acct_id' => $accountId,
                'statementInfo' => ['periodEnd' => '2025-06-30', 'closingBalance' => 2000],
                'statementDetails' => [],
                'transactions' => [],
                'lots' => [
                    [
                        'symbol' => 'AAPL',
                        'quantity' => 10,
                        'purchaseDate' => '2024-06-01',
                        'costBasis' => 1000,
                        'saleDate' => null,
                        'proceeds' => null,
                    ],
                    [
                        'symbol' => 'GOOG',
                        'quantity' => 5,
                        'purchaseDate' => '2024-01-15',
                        'costBasis' => 750,
                        'saleDate' => '2025-06-20',
                        'proceeds' => 900,
                    ],
                ],
            ]],
        ]);

        $response->assertCreated();
        $documentId = (int) $response->json('document.id');

        $positionLot = DB::table('fin_account_lots')
            ->where('document_id', $documentId)
            ->where('symbol', 'AAPL')
            ->first();
        $this->assertSame(FinAccountLot::ORIGIN_STATEMENT_POSITION, $positionLot->lot_origin);

        $dispositionLot = DB::table('fin_account_lots')
            ->where('document_id', $documentId)
            ->where('symbol', 'GOOG')
            ->first();
        $this->assertSame(FinAccountLot::ORIGIN_STATEMENT_DISPOSITION, $dispositionLot->lot_origin);
    }

    public function test_resolver_assign_followed_by_reconciliation_rerun(): void
    {
        $user = $this->createUser();
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'Resolver E2E Account',
            'acct_last_balance' => '0',
        ]);

        $buyTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId,
            't_date' => '2025-01-10',
            't_type' => 'Buy',
            't_symbol' => 'NVDA',
            't_qty' => 20,
            't_amt' => -2000,
            'when_added' => now(),
        ]);
        $sellTId = DB::table('fin_account_line_items')->insertGetId([
            't_account' => $acctId,
            't_date' => '2025-06-10',
            't_type' => 'Sell',
            't_symbol' => 'NVDA',
            't_qty' => -20,
            't_amt' => 2500,
            'when_added' => now(),
        ]);

        $assignResponse = $this->actingAs($user)->postJson('/api/finance/lots/save-assignment', [
            'assignments' => [[
                'close_t_id' => $sellTId,
                'open_t_id' => $buyTId,
                'symbol' => 'NVDA',
                'quantity' => 20,
                'purchase_date' => '2025-01-10',
                'cost_basis' => 2000.00,
                'sale_date' => '2025-06-10',
                'proceeds' => 2500.00,
            ]],
        ]);
        $assignResponse->assertOk()->assertJson(['success' => true, 'created' => 1]);

        $lot = DB::table('fin_account_lots')
            ->where('acct_id', $acctId)
            ->where('symbol', 'NVDA')
            ->first();
        $this->assertNotNull($lot);
        $this->assertSame('manual', $lot->lot_source);

        $reconResponse = $this->actingAs($user)->postJson("/api/finance/{$acctId}/lots/reconciliation/apply", [
            'accept' => [$lot->lot_id],
        ]);
        $reconResponse->assertOk()->assertJson(['success' => true]);

        $this->assertSame('accepted', FinAccountLot::find($lot->lot_id)?->reconciliation_status);
    }

    private function makeFinanceJob(User $user): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'hash-'.$user->id.'-'.uniqid(),
            'original_filename' => 'statement.pdf',
            's3_path' => "genai-import/{$user->id}/uuid/statement.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 2048,
            'context_json' => json_encode(['file_count' => 1]),
            'status' => 'parsed',
        ]);
    }

    private function makeFinanceResult(GenAiImportJob $job): GenAiImportResult
    {
        return GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode(['accounts' => []]),
            'status' => 'pending_review',
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
