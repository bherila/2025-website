<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\FileStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxDocumentControllerTest extends TestCase
{
    use RefreshDatabase;

    private function createEmploymentEntity(int $userId, string $displayName = 'Acme Corp'): FinEmploymentEntity
    {
        return FinEmploymentEntity::withoutEvents(function () use ($userId, $displayName) {
            return FinEmploymentEntity::forceCreate([
                'user_id' => $userId,
                'display_name' => $displayName,
                'type' => 'w2',
                'is_current' => true,
                'start_date' => '2020-01-01',
            ]);
        });
    }

    private function createFinAccount(int $userId, string $name = 'Checking'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
            ]);
        });
    }

    private function createTaxDocument(int $userId, array $overrides = []): FileForTaxDocument
    {
        return FileForTaxDocument::create(array_merge([
            'user_id' => $userId,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'w2-2024.pdf',
            'stored_filename' => '2024.01.01 abc12 w2-2024.pdf',
            's3_path' => "tax_docs/{$userId}/2024.01.01 abc12 w2-2024.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => false,
        ], $overrides));
    }

    public function test_unauthenticated_user_cannot_access_tax_documents(): void
    {
        $response = $this->getJson('/api/finance/tax-documents');
        $response->assertStatus(401);
    }

    public function test_can_list_empty_tax_documents(): void
    {
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/finance/tax-documents');
        $response->assertOk()->assertJson([]);
    }

    public function test_can_store_w2_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $entity = $this->createEmploymentEntity($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 w2-2024.pdf",
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('b', 64),
            'employment_entity_id' => $entity->id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => 'w2', 'tax_year' => 2024]);
    }

    public function test_w2_document_requires_employment_entity_id(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/test.pdf",
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('c', 64),
        ]);

        $response->assertStatus(422);
    }

    public function test_1099_int_document_requires_account_id(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/test.pdf",
            'original_filename' => '1099-int-2024.pdf',
            'form_type' => '1099_int',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('d', 64),
        ]);

        $response->assertStatus(422);
    }

    public function test_1099_misc_document_requires_account_id(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/test.pdf",
            'original_filename' => '1099-misc-2024.pdf',
            'form_type' => '1099_misc',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('m', 64),
        ]);

        $response->assertStatus(422);
    }

    public function test_can_store_1099_misc_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 1099-misc-2024.pdf",
            'original_filename' => '1099-misc-2024.pdf',
            'form_type' => '1099_misc',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('n', 64),
            'account_id' => $account->acct_id,
            'misc_routing' => 'sch_c',
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => '1099_misc', 'tax_year' => 2024, 'misc_routing' => 'sch_c']);
    }

    public function test_can_store_k1_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 k1-2024.pdf",
            'original_filename' => 'k1-2024.pdf',
            'form_type' => 'k1',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('k', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => 'k1', 'tax_year' => 2024]);
    }

    public function test_cannot_store_invalid_form_type(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/test.pdf",
            'original_filename' => 'bad-form.pdf',
            'form_type' => 'invalid_form',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('e', 64),
        ]);

        $response->assertStatus(422);
    }

    public function test_can_list_filtered_by_year(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $entity = $this->createEmploymentEntity($user->id);

        $this->createTaxDocument($user->id, ['tax_year' => 2023, 'employment_entity_id' => $entity->id]);
        $this->createTaxDocument($user->id, ['tax_year' => 2024, 'employment_entity_id' => $entity->id]);

        $response = $this->getJson('/api/finance/tax-documents?year=2023');
        $response->assertOk();
        $docs = $response->json();
        $this->assertCount(1, $docs);
        $this->assertEquals(2023, $docs[0]['tax_year']);
    }

    public function test_can_list_filtered_by_form_type(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $entity = $this->createEmploymentEntity($user->id);
        $account = $this->createFinAccount($user->id);

        $this->createTaxDocument($user->id, ['form_type' => 'w2', 'employment_entity_id' => $entity->id]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'employment_entity_id' => null,
            'account_id' => $account->acct_id,
        ]);

        $response = $this->getJson('/api/finance/tax-documents?form_type=w2');
        $response->assertOk();
        $docs = $response->json();
        $this->assertCount(1, $docs);
        $this->assertEquals('w2', $docs[0]['form_type']);
    }

    public function test_can_delete_own_tax_document(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id);

        $this->mock(FileStorageService::class, function ($mock) {
            $mock->shouldReceive('deleteFileRecord')->once()->andReturn(true);
        });

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}");
        $response->assertOk()->assertJson(['success' => true]);
    }

    public function test_cannot_delete_other_users_tax_document(): void
    {
        $user = $this->createUser();
        $other = $this->createUser();
        $doc = $this->createTaxDocument($other->id);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}");
        $response->assertStatus(404);
    }

    public function test_can_update_reviewed_status(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reviewed' => false]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'is_reviewed' => true,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'is_reviewed' => 1]);
    }

    public function test_can_update_misc_routing(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['form_type' => '1099_misc']);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'misc_routing' => 'sch_e',
        ]);

        $response->assertOk()->assertJsonFragment(['misc_routing' => 'sch_e']);
        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'misc_routing' => 'sch_e']);
    }

    public function test_mark_reviewed_persists_misc_routing(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['form_type' => '1099_misc', 'is_reviewed' => false]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/mark-reviewed", [
            'misc_routing' => 'sch_1_line_8',
        ]);

        $response->assertOk()->assertJsonFragment(['misc_routing' => 'sch_1_line_8']);
        $this->assertDatabaseHas('fin_tax_documents', [
            'id' => $doc->id,
            'is_reviewed' => 1,
            'misc_routing' => 'sch_1_line_8',
        ]);
    }

    public function test_cross_user_isolation(): void
    {
        $userA = $this->createUser();
        $userB = $this->createUser();
        $this->createTaxDocument($userB->id);

        $response = $this->actingAs($userA)->getJson('/api/finance/tax-documents');
        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    public function test_store_rejects_invalid_s3_key_prefix(): void
    {
        $user = $this->createUser();
        $entity = $this->createEmploymentEntity($user->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => 'wrong_prefix/file.pdf',
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('f', 64),
            'employment_entity_id' => $entity->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment(['message' => 'The selected file key is invalid.']);
    }

    public function test_store_rejects_s3_key_with_subdirectory(): void
    {
        $user = $this->createUser();
        $entity = $this->createEmploymentEntity($user->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/subdir/file.pdf",
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('f', 64),
            'employment_entity_id' => $entity->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_store_rejects_s3_key_for_different_user(): void
    {
        $user = $this->createUser();
        $other = $this->createUser();
        $entity = $this->createEmploymentEntity($user->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$other->id}/file.pdf",
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('f', 64),
            'employment_entity_id' => $entity->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_store_dispatches_genai_job(): void
    {
        $user = $this->createUser();
        $entity = $this->createEmploymentEntity($user->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 w2-2024.pdf",
            'original_filename' => 'w2-2024.pdf',
            'form_type' => 'w2',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('g', 64),
            'employment_entity_id' => $entity->id,
        ]);

        $response->assertStatus(201);
        $docId = $response->json('id');

        // Verify the tax document has genai_status set
        $doc = FileForTaxDocument::find($docId);
        $this->assertNotNull($doc);
        $this->assertNotNull($doc->genai_job_id);

        // Verify a genai job was created and linked
        $this->assertDatabaseHas('genai_import_jobs', [
            'user_id' => $user->id,
            'job_type' => 'tax_document',
        ]);
    }

    public function test_can_update_parsed_data(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reviewed' => false]);

        $parsedData = ['box1_wages' => 50000, 'box2_fed_tax' => 8000];

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'parsed_data' => $parsedData,
        ]);

        $response->assertOk();
        $doc->refresh();
        $this->assertEquals(50000, $doc->parsed_data['box1_wages']);
    }

    public function test_can_update_parsed_data_when_reviewed(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reviewed' => true]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'parsed_data' => ['box1_wages' => 50000],
        ]);

        $response->assertOk();
        $doc->refresh();
        $this->assertEquals(50000, $doc->parsed_data['box1_wages']);
    }

    public function test_can_review_and_unreview_document(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reviewed' => false]);

        // Review
        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'is_reviewed' => true,
        ]);
        $response->assertOk();
        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'is_reviewed' => 1]);

        // Unreview
        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'is_reviewed' => false,
        ]);
        $response->assertOk();
        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'is_reviewed' => 0]);
    }

    public function test_download_returns_distinct_view_and_download_urls(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id);

        $this->mock(FileStorageService::class, function ($mock) {
            $mock->shouldReceive('getSignedViewUrl')->once()->andReturn('https://example.com/view');
            $mock->shouldReceive('getSignedDownloadUrl')->once()->andReturn('https://example.com/download');
        });

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}/download");
        $response->assertOk();
        $response->assertJson([
            'view_url' => 'https://example.com/view',
            'download_url' => 'https://example.com/download',
        ]);
    }

    public function test_genai_fields_included_in_api_response(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, [
            'genai_status' => 'parsed',
            'parsed_data' => ['box1_wages' => 50000],
            'is_reviewed' => true,
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/tax-documents');
        $response->assertOk();
        $data = $response->json();
        $this->assertCount(1, $data);
        $this->assertEquals('parsed', $data[0]['genai_status']);
        $this->assertTrue($data[0]['is_reviewed']);
        $this->assertNotNull($data[0]['parsed_data']);
    }

    public function test_can_filter_by_genai_status(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
            'employment_entity_id' => null,
            'genai_status' => 'parsed',
            'is_reviewed' => false,
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
            'employment_entity_id' => null,
            'genai_status' => 'parsed',
            'is_reviewed' => true,
        ]);

        // Filter for unreviewed parsed docs
        $response = $this->getJson('/api/finance/tax-documents?genai_status=parsed&is_reviewed=0');
        $response->assertOk();
        $docs = $response->json();
        $this->assertCount(1, $docs);
        $this->assertFalse($docs[0]['is_reviewed']);
    }

    public function test_manual_store_requires_account_id_for_1099(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents/manual', [
            'form_type' => '1099_int',
            'tax_year' => 2024,
            'parsed_data' => ['box1_interest' => 100.0],
        ]);

        $response->assertStatus(422);
    }

    public function test_manual_store_saves_account_id_for_1099(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents/manual', [
            'form_type' => '1099_int',
            'tax_year' => 2024,
            'account_id' => $account->acct_id,
            'parsed_data' => ['box1_interest' => 100.0],
        ]);

        $response->assertStatus(201);
        // account_id is stored on the join table, not the parent row.
        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
        ]);
    }

    public function test_manual_store_rejects_account_belonging_to_other_user(): void
    {
        $user = $this->createUser();
        $other = $this->createUser();
        $otherAccount = $this->createFinAccount($other->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents/manual', [
            'form_type' => '1099_int',
            'tax_year' => 2024,
            'account_id' => $otherAccount->acct_id,
            'parsed_data' => ['box1_interest' => 100.0],
        ]);

        $response->assertStatus(404);
    }

    public function test_mark_reviewed_confirms_and_reconciles(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reviewed' => false]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/mark-reviewed");
        $response->assertOk();
        $this->assertDatabaseHas('fin_tax_documents', [
            'id' => $doc->id,
            'is_reviewed' => 1,
        ]);
    }

    public function test_can_store_1099_b_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 1099-b-2024.pdf",
            'original_filename' => '1099-b-2024.pdf',
            'form_type' => '1099_b',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('p', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => '1099_b', 'tax_year' => 2024]);
    }

    public function test_can_store_broker_1099_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 broker-1099-2024.pdf",
            'original_filename' => 'broker-1099-2024.pdf',
            'form_type' => 'broker_1099',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('q', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => 'broker_1099', 'tax_year' => 2024]);
    }

    // ── Join table tests ──────────────────────────────────────────────────────

    public function test_storing_1099_int_creates_account_link(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $response = $this->actingAs($user)->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 1099-int.pdf",
            'original_filename' => '1099-int.pdf',
            'form_type' => '1099_int',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('z', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $docId = $response->json('id');

        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $docId,
            'account_id' => $account->acct_id,
            'form_type' => '1099_int',
            'tax_year' => 2024,
        ]);

        // Response includes account_links array
        $this->assertNotEmpty($response->json('account_links'));
        $this->assertEquals($account->acct_id, $response->json('account_links.0.account_id'));
    }

    public function test_index_filters_by_account_id_via_join_table(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);
        $otherAccount = $this->createFinAccount($user->id, 'Other Account');

        // Create a document linked to $account via the join table
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
        ]);
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => '1099_int',
            'tax_year' => 2024,
        ]);

        // Filter by $account — should find it
        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents?account_id={$account->acct_id}");
        $response->assertOk();
        $this->assertCount(1, $response->json());

        // Filter by $otherAccount — should not find it
        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents?account_id={$otherAccount->acct_id}");
        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    public function test_mark_reviewed_writes_through_to_account_links(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'account_id' => $account->acct_id,
            'is_reviewed' => false,
        ]);
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => '1099_div',
            'tax_year' => 2024,
            'is_reviewed' => false,
        ]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/mark-reviewed");
        $response->assertOk();

        $this->assertDatabaseHas('fin_tax_document_accounts', [
            'tax_document_id' => $doc->id,
            'is_reviewed' => 1,
        ]);
    }

    public function test_destroy_account_link_deletes_parent_when_last_link_removed(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
            's3_path' => '',
        ]);
        $link = TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => '1099_int',
            'tax_year' => 2024,
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}");
        $response->assertOk();

        // Parent document should be removed
        $this->assertDatabaseMissing('fin_tax_documents', ['id' => $doc->id]);
    }

    public function test_destroy_account_link_keeps_parent_when_other_links_remain(): void
    {
        $user = $this->createUser();
        $account1 = $this->createFinAccount($user->id, 'Account 1');
        $account2 = $this->createFinAccount($user->id, 'Account 2');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            's3_path' => '',
        ]);
        $link1 = TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account1->acct_id,
            'form_type' => '1099_div',
            'tax_year' => 2024,
        ]);
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account2->acct_id,
            'form_type' => '1099_int',
            'tax_year' => 2024,
        ]);

        // Remove link1 — parent should survive (link2 still exists)
        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link1->id}");
        $response->assertOk();

        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id]);
        $this->assertDatabaseMissing('fin_tax_document_accounts', ['id' => $link1->id]);
    }

    public function test_confirm_account_links_replaces_existing_links(): void
    {
        $user = $this->createUser();
        $account1 = $this->createFinAccount($user->id, 'Account 1');
        $account2 = $this->createFinAccount($user->id, 'Account 2');

        $doc = $this->createTaxDocument($user->id, ['form_type' => 'broker_1099', 'account_id' => null]);
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => null,
            'form_type' => '1099_div',
            'tax_year' => 2024,
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/accounts", [
            'links' => [
                ['account_id' => $account1->acct_id, 'form_type' => '1099_div', 'tax_year' => 2024],
                ['account_id' => $account2->acct_id, 'form_type' => '1099_int', 'tax_year' => 2024],
            ],
        ]);

        $response->assertOk();

        $this->assertDatabaseCount('fin_tax_document_accounts', 2);
        $this->assertDatabaseHas('fin_tax_document_accounts', ['account_id' => $account1->acct_id, 'form_type' => '1099_div']);
        $this->assertDatabaseHas('fin_tax_document_accounts', ['account_id' => $account2->acct_id, 'form_type' => '1099_int']);
    }

    public function test_backfill_seeds_join_table_for_pre_migration_documents(): void
    {
        // Simulate a document that existed before the join table but was backfilled.
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        // Create directly (bypasses store endpoint) to simulate pre-migration data.
        $doc = FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2023,
            'form_type' => '1099_int',
            'account_id' => $account->acct_id,
            'original_filename' => 'old.pdf',
            'stored_filename' => 'old.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => str_repeat('x', 64),
        ]);

        // Manually insert a backfill row (the migration would have done this).
        TaxDocumentAccount::create([
            'tax_document_id' => $doc->id,
            'account_id' => $account->acct_id,
            'form_type' => '1099_int',
            'tax_year' => 2023,
        ]);

        // The index endpoint should find it when filtering by account_id.
        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents?account_id={$account->acct_id}");
        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertEquals($doc->id, $response->json('0.id'));
    }

    // ─────────────────────────────────────────────────────────────────────────

    public function test_can_store_1099_nec_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 1099-nec-2024.pdf",
            'original_filename' => '1099-nec-2024.pdf',
            'form_type' => '1099_nec',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('r', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => '1099_nec', 'tax_year' => 2024]);
    }

    public function test_can_store_1099_r_document(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = $this->createFinAccount($user->id);

        $response = $this->postJson('/api/finance/tax-documents', [
            's3_key' => "tax_docs/{$user->id}/2024.01.01 abc12 1099-r-2024.pdf",
            'original_filename' => '1099-r-2024.pdf',
            'form_type' => '1099_r',
            'tax_year' => 2024,
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('s', 64),
            'account_id' => $account->acct_id,
        ]);

        $response->assertStatus(201);
        $response->assertJsonFragment(['form_type' => '1099_r', 'tax_year' => 2024]);
    }
}
