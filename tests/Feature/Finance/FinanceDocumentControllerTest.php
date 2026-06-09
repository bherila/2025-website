<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\FinStatement;
use App\Services\FileStorageService;
use App\Services\Finance\DocumentCapabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class FinanceDocumentControllerTest extends TestCase
{
    use RefreshDatabase;

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => $name,
            'acct_last_balance' => '0',
        ]));
    }

    /**
     * @param  array<string, mixed>  $attrs
     */
    private function makeDocument(int $userId, array $attrs = []): FinDocument
    {
        return FinDocument::create(array_merge([
            'user_id' => $userId,
            'document_kind' => FinDocument::KIND_TAX_FORM,
            'tax_year' => 2025,
            'original_filename' => 'test-doc.pdf',
            'mime_type' => 'application/pdf',
        ], $attrs));
    }

    // ─── Index pagination ─────────────────────────────────────────────────────

    public function test_index_returns_paginated_results(): void
    {
        $user = $this->createUser();

        for ($i = 0; $i < 55; $i++) {
            $this->makeDocument($user->id, ['original_filename' => "doc-{$i}.pdf"]);
        }

        $response = $this->actingAs($user)->getJson('/api/finance/documents');

        $response->assertOk();
        $response->assertJsonStructure(['data', 'meta', 'links']);
        $this->assertCount(50, $response->json('data'));
        $this->assertSame(55, $response->json('meta.total'));
    }

    public function test_index_accepts_per_page(): void
    {
        $user = $this->createUser();

        for ($i = 0; $i < 10; $i++) {
            $this->makeDocument($user->id);
        }

        $response = $this->actingAs($user)->getJson('/api/finance/documents?per_page=5');

        $response->assertOk();
        $this->assertCount(5, $response->json('data'));
    }

    public function test_index_filters_by_document_kind(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_TAX_FORM]);
        $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        $response = $this->actingAs($user)->getJson('/api/finance/documents?document_kind=tax_form');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('tax_form', $response->json('data.0.document_kind'));
    }

    public function test_index_filters_by_tax_year(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['tax_year' => 2024]);
        $this->makeDocument($user->id, ['tax_year' => 2025]);

        $response = $this->actingAs($user)->getJson('/api/finance/documents?tax_year=2024');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame(2024, $response->json('data.0.tax_year'));
    }

    public function test_index_filters_by_search_query(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['original_filename' => 'my-unique-tax.pdf']);
        $this->makeDocument($user->id, ['original_filename' => 'other.pdf']);

        $response = $this->actingAs($user)->getJson('/api/finance/documents?q=unique-tax');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_index_filters_by_processing_status(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['genai_status' => 'pending']);
        $this->makeDocument($user->id, ['genai_status' => 'parsed']);
        $this->makeDocument($user->id, ['genai_status' => 'parsed', 'parsed_data_needs_review' => true]);

        $pendingResponse = $this->actingAs($user)->getJson('/api/finance/documents?processing_status=pending');

        $pendingResponse->assertOk();
        $this->assertCount(1, $pendingResponse->json('data'));
        $this->assertSame('pending', $pendingResponse->json('data.0.genai_status'));

        $reviewResponse = $this->actingAs($user)->getJson('/api/finance/documents?processing_status=needs_review');

        $reviewResponse->assertOk();
        $this->assertCount(1, $reviewResponse->json('data'));
        $this->assertTrue($reviewResponse->json('data.0.parsed_data_needs_review'));
    }

    public function test_index_filters_by_missing_account(): void
    {
        $user = $this->createUser();
        $doc1 = $this->makeDocument($user->id);
        $doc2 = $this->makeDocument($user->id);

        $account = $this->makeAccount($user->id);

        FinDocumentAccount::create([
            'document_id' => $doc1->id,
            'account_id' => $account->acct_id,
            'form_type' => 'broker_1099',
            'tax_year' => 2025,
        ]);

        FinDocumentAccount::create([
            'document_id' => $doc2->id,
            'account_id' => null,
            'form_type' => 'broker_1099',
            'tax_year' => 2025,
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/documents?missing_account=1');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($doc2->id, $response->json('data.0.id'));
    }

    public function test_index_includes_capabilities(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['s3_path' => 'tax_docs/1/test.pdf']);

        $response = $this->actingAs($user)->getJson('/api/finance/documents');

        $response->assertOk();
        $this->assertArrayHasKey('capabilities', $response->json('data.0'));
        $this->assertContains('view_original', $response->json('data.0.capabilities'));
    }

    // ─── Summary ──────────────────────────────────────────────────────────────

    public function test_summary_returns_counts(): void
    {
        $user = $this->createUser();
        $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_TAX_FORM]);
        $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);
        $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_TAX_FORM]);

        $response = $this->actingAs($user)->getJson('/api/finance/documents/summary');

        $response->assertOk();
        $response->assertJsonStructure(['by_kind', 'by_year', 'by_status', 'missing_account_count', 'total']);
        $this->assertSame(3, $response->json('total'));
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function test_show_returns_detail_resource(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['s3_path' => 'tax_docs/1/test.pdf']);

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}");

        $response->assertOk();
        $response->assertJsonStructure([
            'id', 'document_kind', 'tax_year', 'original_filename',
            'capabilities', 'accounts', 'statements', 'lot_summary',
        ]);
    }

    public function test_show_returns_statement_lineage_facet(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Taxable Brokerage');
        $doc = $this->makeDocument($user->id, [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'period_start' => '2025-01-01',
            'period_end' => '2025-01-31',
        ]);

        FinDocumentAccount::create([
            'document_id' => $doc->id,
            'account_id' => $account->acct_id,
        ]);

        $statement = FinStatement::create([
            'document_id' => $doc->id,
            'acct_id' => $account->acct_id,
            'balance' => '1000.00',
            'statement_closing_date' => '2025-01-31',
        ]);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            'statement_id' => $statement->statement_id,
            't_date' => '2025-01-15',
            't_amt' => '10.00',
            't_description' => 'Dividend',
        ]);
        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            'statement_id' => $statement->statement_id,
            't_date' => '2025-01-16',
            't_amt' => '-5.00',
            't_description' => 'Fee',
        ]);

        $brokerLot = FinAccountLot::query()->create([
            'acct_id' => $account->acct_id,
            'document_id' => $doc->id,
            'statement_id' => $statement->statement_id,
            'symbol' => 'AAPL',
            'quantity' => 1,
            'purchase_date' => '2025-01-01',
            'cost_basis' => 100,
            'cost_per_unit' => 100,
            'sale_date' => '2025-01-15',
            'proceeds' => 110,
            'realized_gain_loss' => 10,
            'lot_source' => FinAccountLot::SOURCE_1099B,
        ]);
        $accountLot = FinAccountLot::query()->create([
            'acct_id' => $account->acct_id,
            'document_id' => $doc->id,
            'statement_id' => $statement->statement_id,
            'symbol' => 'MSFT',
            'quantity' => 1,
            'purchase_date' => '2025-01-02',
            'cost_basis' => 200,
            'cost_per_unit' => 200,
            'sale_date' => '2025-01-16',
            'proceeds' => 210,
            'realized_gain_loss' => 10,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);

        FinLotReconciliationLink::create([
            'document_id' => $doc->id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('statement_facet.period.start', '2025-01-01')
            ->assertJsonPath('statement_facet.period.end', '2025-01-31')
            ->assertJsonPath('statement_facet.balance_snapshots_count', 1)
            ->assertJsonPath('statement_facet.imported_transactions_count', 2)
            ->assertJsonPath('statement_facet.imported_lots_count', 2)
            ->assertJsonPath('statement_facet.linked_accounts.0.account.acct_name', 'Taxable Brokerage')
            ->assertJsonPath('lot_summary_facet.count', 2)
            ->assertJsonPath('lot_summary_facet.counts_by_source.broker_1099b', 1)
            ->assertJsonPath('lot_summary_facet.counts_by_source.account_derived', 1)
            ->assertJsonPath('lot_summary_facet.counts_by_reconciliation_state.needs_review', 2);
    }

    public function test_show_returns_tax_review_facet(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Brokerage');
        $doc = $this->makeDocument($user->id, [
            'document_kind' => FinDocument::KIND_TAX_FORM,
            'tax_year' => 2025,
        ]);

        $taxDocument = FileForTaxDocument::create([
            'user_id' => $user->id,
            'document_id' => $doc->id,
            'tax_year' => 2025,
            'form_type' => FileForTaxDocument::FORM_TYPE_1099_B,
            'original_filename' => '1099-b.pdf',
            'stored_filename' => 'stored-1099-b.pdf',
            's3_path' => "tax_docs/{$user->id}/stored-1099-b.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 100,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $user->id,
            'genai_status' => 'parsed',
            'parsed_data' => ['b_total_proceeds' => 123.45],
            'is_reviewed' => false,
        ]);

        FinDocumentAccount::create([
            'document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => FileForTaxDocument::FORM_TYPE_1099_B,
            'tax_year' => 2025,
            'ai_identifier' => '1234',
            'ai_account_name' => 'Brokerage 1234',
        ]);

        $lot = FinAccountLot::query()->create([
            'acct_id' => $account->acct_id,
            'document_id' => $doc->id,
            'symbol' => 'AAPL',
            'quantity' => 1,
            'purchase_date' => '2025-01-01',
            'cost_basis' => 100,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-01',
            'proceeds' => 125,
            'realized_gain_loss' => 25,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        FinLotReconciliationLink::create([
            'document_id' => $doc->id,
            'broker_lot_id' => $lot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('tax_facet.tax_document_id', $taxDocument->id)
            ->assertJsonPath('tax_facet.form_type', FileForTaxDocument::FORM_TYPE_1099_B)
            ->assertJsonPath('tax_facet.review_status', 'needs_review')
            ->assertJsonPath('tax_facet.account_links.0.ai_identifier', '1234')
            ->assertJsonPath('tax_facet.parsed_data_summary.warnings_count', 1)
            ->assertJsonPath('tax_facet.downstream_effects.linked_lots_count', 1)
            ->assertJsonPath('tax_facet.downstream_effects.reconciliation_link_counts_by_state.accepted_broker', 1)
            ->assertJsonPath('tax_facet.review_document.id', $taxDocument->id);
    }

    public function test_show_returns_404_for_other_user(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();
        $this->grantAllFeatures($user2);
        $doc = $this->makeDocument($user1->id);

        $response = $this->actingAs($user2)->getJson("/api/finance/documents/{$doc->id}");

        $response->assertNotFound();
    }

    // ─── Impact Preview ───────────────────────────────────────────────────────

    public function test_impact_preview_returns_summary_and_hash(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id);

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/impact-preview");

        $response->assertOk();
        $response->assertJsonStructure(['summary', 'impact_hash']);
        $this->assertSame($doc->id, $response->json('summary.document_id'));
    }

    // ─── Destroy ──────────────────────────────────────────────────────────────

    public function test_destroy_with_valid_hash_deletes_document(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        // Get impact preview
        $previewResponse = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/impact-preview");
        $hash = $previewResponse->json('impact_hash');

        // Delete
        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", [
            'impact_hash' => $hash,
        ]);

        $response->assertOk();
        $this->assertDatabaseMissing('fin_documents', ['id' => $doc->id]);
    }

    public function test_destroy_with_invalid_hash_returns_409(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", [
            'impact_hash' => 'invalid-hash-value',
        ]);

        $response->assertStatus(409);
        $this->assertDatabaseHas('fin_documents', ['id' => $doc->id]);
    }

    public function test_destroy_requires_impact_hash(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", []);

        $response->assertStatus(422);
    }

    // ─── Auth guard ───────────────────────────────────────────────────────────

    public function test_index_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/documents');
        $response->assertUnauthorized();
    }

    // ─── Download: path guard (FIX 1 – IDOR hardening) ───────────────────────

    /**
     * A FinDocument row whose s3_path was persisted outside the owner's expected
     * prefix (poisoned/legacy row) must never produce a signed URL via download().
     * The endpoint must return 404 without calling FileStorageService.
     */
    public function test_download_aborts_when_s3_path_is_outside_owner_prefix(): void
    {
        $owner = $this->createUser();
        $otherUser = $this->createUser();

        // Simulate a poisoned row: user_id is owner but s3_path belongs to otherUser.
        $poisonedDoc = $this->makeDocument($owner->id, [
            'document_kind' => FinDocument::KIND_STATEMENT,
            's3_path' => "fin_documents/{$otherUser->id}/statement/secret.pdf",
            'original_filename' => 'secret.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->mock(FileStorageService::class, function ($mock): void {
            $mock->shouldNotReceive('getSignedViewUrl');
            $mock->shouldNotReceive('getSignedDownloadUrl');
        });

        $response = $this->actingAs($owner)->getJson("/api/finance/documents/{$poisonedDoc->id}/download");

        $response->assertNotFound();
    }

    /**
     * A FinDocument with a valid, owner-scoped s3_path must produce signed URLs
     * normally — confirming the path guard does not block legitimate downloads.
     */
    public function test_download_returns_signed_urls_for_valid_owner_path(): void
    {
        $user = $this->createUser();

        $doc = $this->makeDocument($user->id, [
            'document_kind' => FinDocument::KIND_STATEMENT,
            's3_path' => "fin_documents/{$user->id}/statement/jan.pdf",
            'original_filename' => 'jan.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->mock(FileStorageService::class, function ($mock) use ($doc): void {
            $mock->shouldReceive('getSignedViewUrl')
                ->once()
                ->with($doc->s3_path, 'application/pdf')
                ->andReturn('https://signed.example/view');
            $mock->shouldReceive('getSignedDownloadUrl')
                ->once()
                ->with($doc->s3_path, 'jan.pdf')
                ->andReturn('https://signed.example/download');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/download");

        $response->assertOk()
            ->assertJson([
                'view_url' => 'https://signed.example/view',
                'download_url' => 'https://signed.example/download',
                'filename' => 'jan.pdf',
            ]);
    }

    // ─── Blocker 1: impact hash isolation ────────────────────────────────────

    /**
     * Same counts but different user_id → different hash.
     * Prevents a user from replaying another user's hash to delete their document.
     */
    public function test_impact_hash_differs_for_same_counts_different_user(): void
    {
        $userA = $this->createUser();
        $userB = $this->createUser();

        $docA = $this->makeDocument($userA->id);
        $docB = $this->makeDocument($userB->id);

        $service = app(DocumentCapabilityService::class);

        $hashA = $service->computeImpactSummary($docA)['impact_hash'];
        $hashB = $service->computeImpactSummary($docB)['impact_hash'];

        // Same counts (all zero), different user → different hash
        $this->assertNotSame($hashA, $hashB);
    }

    /**
     * Same user, same counts, but different document_id → different hash.
     * Prevents replay of one document's hash against a sibling document.
     */
    public function test_impact_hash_differs_for_different_document_id_same_user(): void
    {
        $user = $this->createUser();

        $doc1 = $this->makeDocument($user->id);
        $doc2 = $this->makeDocument($user->id);

        $service = app(DocumentCapabilityService::class);

        $hash1 = $service->computeImpactSummary($doc1)['impact_hash'];
        $hash2 = $service->computeImpactSummary($doc2)['impact_hash'];

        // Same counts, same user, but different document → different hash
        $this->assertNotSame($hash1, $hash2);
    }

    /**
     * Hash is deterministic: calling computeImpactSummary twice on the same
     * document with no intervening changes produces the same hash.
     */
    public function test_impact_hash_is_stable_for_same_document(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id);

        $service = app(DocumentCapabilityService::class);

        $hash1 = $service->computeImpactSummary($doc)['impact_hash'];
        $hash2 = $service->computeImpactSummary($doc)['impact_hash'];

        $this->assertSame($hash1, $hash2);
    }

    public function test_impact_hash_is_signed_with_server_secret(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id);

        $result = app(DocumentCapabilityService::class)->computeImpactSummary($doc);

        $predictableHash = hash('sha256', (string) json_encode([
            'file_hash' => $doc->file_hash,
            'summary' => $result['summary'],
        ]));

        $this->assertNotSame($predictableHash, $result['impact_hash']);
    }

    /**
     * Attacker cannot delete owner's document by supplying their own document's hash,
     * even when both documents have identical counts. The auth scope rejects it with 404.
     */
    public function test_destroy_cannot_use_own_hash_on_another_users_document(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();
        $this->grantAllFeatures($attacker);

        $ownerDoc = $this->makeDocument($owner->id);
        $attackerDoc = $this->makeDocument($attacker->id);

        // Attacker gets a valid hash for their own (structurally identical) document
        $service = app(DocumentCapabilityService::class);
        $attackerHash = $service->computeImpactSummary($attackerDoc)['impact_hash'];

        // Attempt to delete owner's document with attacker's hash
        $response = $this->actingAs($attacker)->deleteJson("/api/finance/documents/{$ownerDoc->id}", [
            'impact_hash' => $attackerHash,
        ]);

        // Scoped query returns 404 before hash check even runs
        $response->assertNotFound();
        $this->assertDatabaseHas('fin_documents', ['id' => $ownerDoc->id]);
    }

    // ─── Blocker 2: N+1 on lots ───────────────────────────────────────────────

    /**
     * index() must not issue one query per document to check for lots.
     * With N documents each having lots, total queries must stay well below N+baseline.
     */
    public function test_index_does_not_produce_n_plus_1_queries_for_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        for ($i = 0; $i < 3; $i++) {
            $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);
            FinDocumentAccount::create([
                'document_id' => $doc->id,
                'account_id' => $account->acct_id,
            ]);
            FinAccountLot::query()->create([
                'acct_id' => $account->acct_id,
                'document_id' => $doc->id,
                'symbol' => 'AAPL',
                'quantity' => 1,
                'purchase_date' => '2024-01-01',
                'cost_basis' => 100,
                'cost_per_unit' => 100,
                'sale_date' => '2025-01-15',
                'proceeds' => 120,
                'realized_gain_loss' => 20,
                'lot_origin' => 'statement_disposition',
            ]);
        }

        DB::enableQueryLog();
        $response = $this->actingAs($user)->getJson('/api/finance/documents');
        $response->assertOk();
        $this->assertContains('open_lot_workspace', $response->json('data.0.capabilities'));
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        // Without eager-loading lots, this would be baseline + N (3 extra).
        // With 'lots:lot_id,document_id' in with(), total should be ≤ 10.
        $this->assertLessThan(15, $queryCount, "Expected < 15 queries, got {$queryCount}");
    }

    // ─── Comment 2: created_desc sort ────────────────────────────────────────

    /**
     * When sort=created_desc, the most recently created document must be first
     * regardless of its tax_year or period_end values.
     */
    public function test_index_sort_created_desc_orders_by_created_at_not_tax_year(): void
    {
        $user = $this->createUser();

        // Create a document with a newer tax year but explicitly older created_at
        $older = $this->makeDocument($user->id, [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'tax_year' => 2025,
            'created_at' => now()->subHours(2),
        ]);

        // Create a document with an older tax year but explicitly newer created_at
        $recent = $this->makeDocument($user->id, [
            'document_kind' => FinDocument::KIND_STATEMENT,
            'tax_year' => 2020,
            'created_at' => now(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/documents?sort=created_desc');

        $response->assertOk();
        $response->assertJsonPath('data.0.id', $recent->id);
        $response->assertJsonPath('data.1.id', $older->id);
    }

    // ─── Comment 1: form1116_overrides in impact hash ─────────────────────────

    /**
     * Adding a Form 1116 override row between preview and delete must invalidate
     * the impact_hash and cause destroy() to return 409.
     */
    public function test_adding_form1116_override_between_preview_and_delete_invalidates_hash(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        // Capture the preview hash before adding the override
        $previewResponse = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/impact-preview");
        $previewResponse->assertOk();
        $hash = $previewResponse->json('impact_hash');

        // Add a Form 1116 override row for this document
        DB::table('fin_tax_document_form1116_overrides')->insert([
            'user_id' => $user->id,
            'document_id' => $doc->id,
            'payer_tin' => '12-3456789',
            'account_identifier' => 'ACC001',
            'gross_foreign_source_income' => 500.00,
            'override_reason' => 'Test override',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // The stale hash should now be rejected
        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", [
            'impact_hash' => $hash,
        ]);

        $response->assertStatus(409);
        $this->assertDatabaseHas('fin_documents', ['id' => $doc->id]);
    }

    /**
     * The impact summary must include the form1116_overrides count.
     */
    public function test_impact_summary_includes_form1116_overrides_count(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        DB::table('fin_tax_document_form1116_overrides')->insert([
            'user_id' => $user->id,
            'document_id' => $doc->id,
            'payer_tin' => '12-3456789',
            'account_identifier' => 'ACC001',
            'gross_foreign_source_income' => 500.00,
            'override_reason' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/impact-preview");
        $response->assertOk();
        $this->assertSame(1, $response->json('summary.form1116_overrides'));
    }

    // ─── Comment 3: statement cascade tables in impact hash ───────────────────

    /**
     * Adding a row in any statement-cascade table between preview and delete must
     * invalidate the impact_hash → 409.
     */
    /**
     * @param  array<string, mixed>  $extraColumns
     */
    #[DataProvider('statementCascadeTableProvider')]
    public function test_adding_statement_cascade_row_invalidates_hash(string $table, array $extraColumns): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $doc = $this->makeDocument($user->id, ['document_kind' => FinDocument::KIND_STATEMENT]);

        $statementId = DB::table('fin_statements')->insertGetId([
            'document_id' => $doc->id,
            'acct_id' => $account->acct_id,
            'balance' => '0',
        ]);

        // Get preview hash before adding child row
        $previewResponse = $this->actingAs($user)->getJson("/api/finance/documents/{$doc->id}/impact-preview");
        $previewResponse->assertOk();
        $hash = $previewResponse->json('impact_hash');

        // Add a row to the cascade table
        DB::table($table)->insert(array_merge(['statement_id' => $statementId], $extraColumns));

        // The stale hash must now be rejected
        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", [
            'impact_hash' => $hash,
        ]);

        $response->assertStatus(409);
        $this->assertDatabaseHas('fin_documents', ['id' => $doc->id]);
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function statementCascadeTableProvider(): array
    {
        return [
            'cash_report' => [
                'fin_statement_cash_report',
                ['currency' => 'USD', 'line_item' => 'Cash', 'total' => 1000.00],
            ],
            'nav' => [
                'fin_statement_nav',
                ['asset_class' => 'Equity', 'current_total' => 50000.00],
            ],
            'performance' => [
                'fin_statement_performance',
                ['perf_type' => 'Total', 'symbol' => 'AAPL'],
            ],
            'positions' => [
                'fin_statement_positions',
                ['symbol' => 'AAPL', 'quantity' => 10.0, 'market_value' => 1500.00],
            ],
            'securities_lent' => [
                'fin_statement_securities_lent',
                ['symbol' => 'MSFT', 'quantity' => 5.0],
            ],
        ];
    }
}
