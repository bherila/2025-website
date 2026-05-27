<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_show_returns_404_for_other_user(): void
    {
        $user1 = $this->createUser();
        $user2 = $this->createUser();
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
        $doc = $this->makeDocument($user->id);

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
        $doc = $this->makeDocument($user->id);

        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", [
            'impact_hash' => 'invalid-hash-value',
        ]);

        $response->assertStatus(409);
        $this->assertDatabaseHas('fin_documents', ['id' => $doc->id]);
    }

    public function test_destroy_requires_impact_hash(): void
    {
        $user = $this->createUser();
        $doc = $this->makeDocument($user->id);

        $response = $this->actingAs($user)->deleteJson("/api/finance/documents/{$doc->id}", []);

        $response->assertStatus(422);
    }

    // ─── Auth guard ───────────────────────────────────────────────────────────

    public function test_index_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/documents');
        $response->assertUnauthorized();
    }
}
