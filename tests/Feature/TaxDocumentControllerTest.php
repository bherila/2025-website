<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\FileStorageService;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\PartnershipBasisService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
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
        $attributes = array_merge([
            'user_id' => $userId,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'w2-2024.pdf',
            'stored_filename' => '2024.01.01 abc12 w2-2024.pdf',
            's3_path' => "tax_docs/{$userId}/2024.01.01 abc12 w2-2024.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 102400,
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => false,
        ], $overrides);

        $attributes['file_hash'] ??= hash('sha256', fake()->uuid());

        return app(DocumentIngestionService::class)->createTaxFormDetail($attributes);
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

        foreach (['sch_c', 'sch_e', 'sch_1_8z'] as $routing) {
            $doc = $this->createTaxDocument($user->id, ['form_type' => '1099_misc']);

            $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
                'misc_routing' => $routing,
            ]);

            $response->assertOk()->assertJsonFragment(['misc_routing' => $routing]);
            $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'misc_routing' => $routing]);
        }
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

    public function test_mark_reviewed_accepts_schedule_1_subroute_misc_routing(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['form_type' => '1099_misc', 'is_reviewed' => false]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/mark-reviewed", [
            'misc_routing' => 'sch_1_8i',
        ]);

        $response->assertOk()->assertJsonFragment(['misc_routing' => 'sch_1_8i']);
        $this->assertDatabaseHas('fin_tax_documents', [
            'id' => $doc->id,
            'is_reviewed' => 1,
            'misc_routing' => 'sch_1_8i',
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
            'job_type' => 'document_extract',
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
        $this->assertDatabaseHas('fin_document_accounts', [
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
        $doc = FileForTaxDocument::findOrFail($docId);

        $this->assertDatabaseHas('fin_document_accounts', [
            'document_id' => $doc->document_id,
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
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_int', 2024);

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
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/mark-reviewed");
        $response->assertOk();

        $this->assertDatabaseHas('fin_document_accounts', [
            'document_id' => $doc->document_id,
            'is_reviewed' => 1,
        ]);
    }

    public function test_can_update_account_link_reporting_mode(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'is_reviewed' => true,
        ]);
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024, isReviewed: true);

        $response = $this->actingAs($user)->patchJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}", [
            'reporting_mode' => 'form_8949_summary',
        ]);

        $response->assertOk()
            ->assertJsonPath('reporting_mode', 'form_8949_summary');

        $this->assertDatabaseHas('fin_document_accounts', [
            'id' => $link->id,
            'reporting_mode' => 'form_8949_summary',
        ]);
    }

    public function test_can_update_account_link_misc_routing_to_schedule_1_subroute(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
        ]);
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_misc', 2024);

        $response = $this->actingAs($user)->patchJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}", [
            'misc_routing' => 'sch_1_8h',
        ]);

        $response->assertOk()
            ->assertJsonPath('misc_routing', 'sch_1_8h');

        $this->assertDatabaseHas('fin_document_accounts', [
            'id' => $link->id,
            'misc_routing' => 'sch_1_8h',
        ]);
    }

    public function test_update_account_link_rejects_invalid_reporting_mode(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
        ]);
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024);

        $response = $this->actingAs($user)->patchJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}", [
            'reporting_mode' => 'not_valid',
        ]);

        $response->assertStatus(422);
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
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_int', 2024);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}");
        $response->assertOk();

        // Parent document should be removed
        $this->assertDatabaseMissing('fin_tax_documents', ['id' => $doc->id]);
    }

    public function test_destroy_last_k1_account_link_recomputes_partnership_basis_year(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'K1 Link Account');
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            's3_path' => '',
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => [
                    'A' => ['value' => '12-3456789'],
                    'B' => ['value' => 'Link Delete LP'],
                    'D' => ['value' => 'false'],
                    '5' => ['value' => '100'],
                ],
                'codes' => [],
                'basis' => [],
            ],
        ]);
        $link = TaxDocumentAccount::createLink($doc->id, $account->acct_id, 'k1', 2024, isReviewed: true);
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);
        $basisYear = FinPartnershipBasisYear::query()->where('user_id', $user->id)->where('tax_year', 2024)->firstOrFail();
        $this->assertSame(100_00, $basisYear->ending_outside_basis_cents);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('fin_tax_documents', ['id' => $doc->id]);
        $this->assertDatabaseMissing('fin_partnership_basis_events', ['tax_document_id' => $doc->id]);
        $freshBasisYear = $basisYear->fresh();
        $this->assertInstanceOf(FinPartnershipBasisYear::class, $freshBasisYear);
        $this->assertSame(0, $freshBasisYear->ending_outside_basis_cents);
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
        $link1 = TaxDocumentAccount::createLink($doc->id, $account1->acct_id, '1099_div', 2024);
        TaxDocumentAccount::createLink($doc->id, $account2->acct_id, '1099_int', 2024);

        // Remove link1 — parent should survive (link2 still exists)
        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}/accounts/{$link1->id}");
        $response->assertOk();

        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id]);
        $this->assertDatabaseMissing('fin_document_accounts', ['id' => $link1->id]);
    }

    public function test_destroy_k1_document_recomputes_partnership_basis_year(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'K1 Document Account');
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            's3_path' => '',
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => [
                    'A' => ['value' => '98-7654321'],
                    'B' => ['value' => 'Document Delete LP'],
                    'D' => ['value' => 'false'],
                    '5' => ['value' => '125'],
                ],
                'codes' => [],
                'basis' => [],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, 'k1', 2024, isReviewed: true);
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);
        $basisYear = FinPartnershipBasisYear::query()->where('user_id', $user->id)->where('tax_year', 2024)->firstOrFail();
        $this->assertSame(125_00, $basisYear->ending_outside_basis_cents);

        $response = $this->actingAs($user)->deleteJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('fin_tax_documents', ['id' => $doc->id]);
        $this->assertDatabaseMissing('fin_partnership_basis_events', ['tax_document_id' => $doc->id]);
        $freshBasisYear = $basisYear->fresh();
        $this->assertInstanceOf(FinPartnershipBasisYear::class, $freshBasisYear);
        $this->assertSame(0, $freshBasisYear->ending_outside_basis_cents);
    }

    public function test_confirm_account_links_replaces_existing_links(): void
    {
        $user = $this->createUser();
        $account1 = $this->createFinAccount($user->id, 'Account 1');
        $account2 = $this->createFinAccount($user->id, 'Account 2');

        $doc = $this->createTaxDocument($user->id, ['form_type' => 'broker_1099', 'account_id' => null]);
        TaxDocumentAccount::createLink($doc->id, null, '1099_div', 2024);

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/accounts", [
            'links' => [
                ['account_id' => $account1->acct_id, 'form_type' => '1099_div', 'tax_year' => 2024],
                ['account_id' => $account2->acct_id, 'form_type' => '1099_int', 'tax_year' => 2024],
            ],
        ]);

        $response->assertOk();

        $this->assertDatabaseCount('fin_document_accounts', 2);
        $this->assertDatabaseHas('fin_document_accounts', ['account_id' => $account1->acct_id, 'form_type' => '1099_div']);
        $this->assertDatabaseHas('fin_document_accounts', ['account_id' => $account2->acct_id, 'form_type' => '1099_int']);
    }

    public function test_backfill_seeds_join_table_for_pre_migration_documents(): void
    {
        // Simulate a document that existed before the unified account table but was backfilled.
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
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
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_int', 2023);

        // The index endpoint should find it when filtering by account_id.
        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents?account_id={$account->acct_id}");
        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertEquals($doc->id, $response->json('0.id'));
    }

    public function test_show_canonicalizes_noncanonical_1099_div_parsed_data_and_flags_review(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'account_id' => $account->acct_id,
            'parsed_data' => [
                'payer_tin' => '27-1967207',
                'recipient_tin' => 'XXX-XX-9913',
                'fatca_filing_requirement' => false,
                'boxes' => [
                    '1a_total_ordinary_dividends' => 1816.11,
                    '1b_qualified_dividends' => 1732.51,
                    '2a_total_capital_gain_distributions' => 8.15,
                    '7_foreign_tax_paid' => 10.45,
                    '8_foreign_country_or_us_possession' => 'See detail',
                ],
                'state_tax_withheld' => 0,
                'detail_totals' => [
                    'total_dividends_and_distributions' => 1834.58,
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024);

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.box1a_ordinary', 1816.11)
            ->assertJsonPath('parsed_data.box1b_qualified', 1732.51)
            ->assertJsonPath('parsed_data.box2a_cap_gain', 8.15)
            ->assertJsonPath('parsed_data.box7_foreign_tax', 10.45)
            ->assertJsonPath('parsed_data.box8_foreign_country', 'See detail')
            ->assertJsonPath('parsed_data.box14_state_tax', 0)
            ->assertJsonPath('parsed_data.detail_totals.total_dividends_and_distributions', 1834.58)
            ->assertJsonPath('has_original_parsed_data', true)
            ->assertJsonPath('parsed_data_needs_review', true)
            ->assertJsonPath('parsed_data_warnings.0.code', 'canonicalized_alias')
            ->assertJsonMissingPath('original_parsed_data');

        $this->assertFalse((bool) $doc->fresh()->parsed_data_needs_review);

        $originalResponse = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}?include_original_parsed_data=1");
        $originalResponse->assertOk()
            ->assertJsonPath('original_parsed_data.boxes.1a_total_ordinary_dividends', 1816.11);
    }

    public function test_update_persists_canonicalization_review_flags(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'account_id' => $account->acct_id,
            'parsed_data' => ['payer_name' => 'Fidelity'],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'parsed_data' => [
                'box1a_ordinary' => 100.00,
                'boxes' => [
                    '1a_total_ordinary_dividends' => 999.99,
                    '1b_qualified_dividends' => 80.00,
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('parsed_data.box1a_ordinary', 100)
            ->assertJsonPath('parsed_data.box1b_qualified', 80)
            ->assertJsonPath('parsed_data_needs_review', true);

        $doc->refresh();
        $this->assertTrue((bool) $doc->parsed_data_needs_review);
        $this->assertSame('canonicalized_alias', $doc->parsed_data_warnings[0]['code'] ?? null);
    }

    public function test_update_k1_with_tax_facts_refreshes_partnership_basis_facts(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'K-1 Account');
        $parsedData = [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => [
                'A' => ['value' => '12-3456789'],
                'B' => ['value' => 'Immediate Facts LP'],
                'D' => ['value' => 'false'],
                '5' => ['value' => '100'],
            ],
            'codes' => ['19' => [['code' => 'A', 'value' => '40']]],
        ];
        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            'is_reviewed' => true,
            'parsed_data' => $parsedData,
        ]);
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);
        $this->assertSame(40_00, FinPartnershipBasisYear::query()->firstOrFail()->cash_distributions_cents);

        $parsedData['codes']['19'][0]['value'] = '60';
        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}?include_tax_facts=1", [
            'parsed_data' => $parsedData,
            'is_reviewed' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('taxFacts.partnershipBasis.interests.0.worksheet.cashDistributions', 60)
            ->assertJsonPath('taxFacts.partnershipBasis.interests.0.worksheet.endingOutsideBasis', 40);
        $this->assertSame(60_00, FinPartnershipBasisYear::query()->firstOrFail()->cash_distributions_cents);
    }

    public function test_show_preserves_accessor_transformed_k1_parsed_data(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Partnership');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            'parsed_data' => [
                'entity_name' => 'Sample Partnership',
                'box1_ordinary_income' => 500,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, 'k1', 2024);

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.schemaVersion', '1.0')
            ->assertJsonPath('parsed_data.fields.B.value', 'Sample Partnership')
            ->assertJsonPath('parsed_data.fields.1.value', '500');
    }

    public function test_broker_1099_canonicalizes_entries_and_flags_matching_link_for_review(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Wealthfront S&P500 FLFF');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'parsed_data' => [
                [
                    'account_identifier' => 'x2070',
                    'account_name' => 'Wealthfront S&P500 FLFF',
                    'form_type' => '1099_div',
                    'tax_year' => 2024,
                    'parsed_data' => [
                        'payer_name' => 'Apex Clearing',
                        'boxes' => [
                            '1a_total_ordinary_dividends' => 250.12,
                            '1b_qualified_dividends' => 225.10,
                        ],
                    ],
                ],
            ],
        ]);
        $link = TaxDocumentAccount::createLink(
            $doc->id,
            $account->acct_id,
            '1099_div',
            2024,
            aiIdentifier: 'x2070',
            aiAccountName: 'Wealthfront S&P500 FLFF',
        );

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.0.parsed_data.box1a_ordinary', 250.12)
            ->assertJsonPath('parsed_data.0.parsed_data.box1b_qualified', 225.10)
            ->assertJsonPath('parsed_data_needs_review', false)
            ->assertJsonPath('account_links.0.parsed_data_needs_review', true)
            ->assertJsonPath('account_links.0.has_original_parsed_data', true)
            ->assertJsonPath('account_links.0.parsed_data_warnings.0.code', 'canonicalized_alias');

        $this->assertFalse((bool) $doc->fresh()->parsed_data_needs_review);
        $this->assertFalse((bool) $link->fresh()->parsed_data_needs_review);
    }

    public function test_show_canonicalizes_legacy_flat_broker_1099_aliases(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'account_number' => '637-768451',
                'div_1a_total_ordinary' => 100.12,
                'div_2a_total_cap_gain' => 25.34,
                'div_4_fed_tax_withheld' => 5.00,
                'div_5_section199a' => 2.50,
                'int_1_interest_income' => 10.00,
                'int_4_fed_tax_withheld' => 1.00,
                'misc_4_fed_tax_withheld' => 0.50,
                'b_total_proceeds' => 1000.00,
                'b_total_cost' => 800.00,
                'b_total_gain_loss' => 200.00,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.box1a_ordinary', 100.12)
            ->assertJsonPath('parsed_data.box2a_cap_gain', 25.34)
            ->assertJsonPath('parsed_data.box5_section_199a', 2.5)
            ->assertJsonPath('parsed_data.box1_interest', 10)
            ->assertJsonPath('parsed_data.total_proceeds', 1000)
            ->assertJsonPath('parsed_data.total_cost_basis', 800)
            ->assertJsonPath('parsed_data.total_realized_gain_loss', 200)
            ->assertJsonPath('parsed_data_needs_review', true);
    }

    public function test_1099_b_preserves_supplemental_statement_details(): void
    {
        $user = $this->createUser();

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_b',
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'payer_tin' => '04-3523567',
                'total_proceeds' => 749840.20,
                'total_cost_basis' => 799409.88,
                'total_wash_sale_disallowed' => 536.36,
                'total_realized_gain_loss' => -49569.68,
                'transactions' => [],
                'supplemental_statement' => [
                    'short_dividends_total' => 3230.55,
                    'short_dividends' => [
                        [
                            'description' => 'ACUITY INC.',
                            'cusip' => '00508Y102',
                            'date' => '2025-11-03',
                            'amount' => 0.68,
                        ],
                    ],
                    'margin_interest_paid_total' => 7373.74,
                ],
            ],
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.supplemental_statement.short_dividends_total', 3230.55)
            ->assertJsonPath('parsed_data.supplemental_statement.short_dividends.0.cusip', '00508Y102')
            ->assertJsonPath('parsed_data.supplemental_statement.margin_interest_paid_total', 7373.74)
            ->assertJsonPath('parsed_data_needs_review', false);
    }

    public function test_can_convert_legacy_flat_broker_1099_to_multi_entry_format(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'is_reviewed' => true,
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'account_number' => '637-768451',
                'div_1a_total_ordinary' => 100.12,
                'b_total_proceeds' => 1000.00,
                'b_total_cost' => 800.00,
                'b_total_gain_loss' => 200.00,
            ],
        ]);
        $divLink = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024, isReviewed: true, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');
        $brokerLink = TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024, isReviewed: true, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/convert-broker-format");

        $response->assertOk()
            ->assertJsonPath('is_reviewed', false)
            ->assertJsonPath('parsed_data.0.account_identifier', '637-768451')
            ->assertJsonPath('parsed_data.0.account_name', 'Fidelity SMA')
            ->assertJsonPath('parsed_data.0.form_type', '1099_div')
            ->assertJsonPath('parsed_data.0.parsed_data.box1a_ordinary', 100.12)
            ->assertJsonPath('parsed_data.1.form_type', '1099_b')
            ->assertJsonPath('parsed_data.1.parsed_data.total_cost_basis', 800)
            ->assertJsonPath('parsed_data.1.parsed_data.transactions', [])
            ->assertJsonPath('account_links.0.is_reviewed', false)
            ->assertJsonPath('account_links.1.is_reviewed', false);

        $this->assertTrue(array_is_list($doc->fresh()->parsed_data));
        $this->assertFalse((bool) $doc->fresh()->is_reviewed);
        $this->assertFalse((bool) $divLink->fresh()->is_reviewed);
        $this->assertFalse((bool) $brokerLink->fresh()->is_reviewed);
        $this->assertDatabaseCount('fin_document_accounts', 2);
    }

    public function test_convert_broker_format_rejects_non_broker_documents(): void
    {
        $user = $this->createUser();

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'parsed_data' => [
                'payer_name' => 'Fidelity',
                'box1a_ordinary' => 100.12,
            ],
        ]);

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/convert-broker-format");

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Only broker_1099 documents can be converted to the current multi-entry format.');
    }

    public function test_convert_broker_format_keeps_1099_b_rows_with_transactions_but_no_totals(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'account_number' => '637-768451',
                'transactions' => [
                    [
                        'symbol' => 'ABBV',
                        'description' => 'ABBVIE INC COM USD0.01',
                        'quantity' => 9,
                        'purchase_date' => '2025-10-08',
                        'sale_date' => '2025-11-25',
                        'proceeds' => 2087.74,
                        'cost_basis' => 2085.98,
                    ],
                ],
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/convert-broker-format");

        $response->assertOk()
            ->assertJsonPath('parsed_data.0.form_type', '1099_b')
            ->assertJsonPath('parsed_data.0.parsed_data.transactions.0.symbol', 'ABBV')
            ->assertJsonPath('parsed_data.0.parsed_data.transactions.0.proceeds', 2087.74);
    }

    public function test_can_queue_broker_1099_reprocessing_from_existing_pdf(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'is_reviewed' => true,
            'genai_status' => 'parsed',
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'b_total_proceeds' => 1000.00,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_b', 2024, isReviewed: true, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/reprocess");

        $response->assertOk()
            ->assertJsonPath('genai_status', 'pending')
            ->assertJsonPath('is_reviewed', false)
            ->assertJsonPath('account_links.0.is_reviewed', false);

        $job = GenAiImportJob::latest('id')->first();
        $this->assertNotNull($job);
        $this->assertSame('document_extract', $job->job_type);
        $this->assertSame($doc->document_id, $job->getContextArray()['document_id']);
        $this->assertSame('tax_form', $job->getContextArray()['document_kind']);
        Queue::assertPushed(ParseImportJob::class);
    }

    public function test_can_queue_broker_1099_format_repair_from_stored_data(): void
    {
        Queue::fake();
        Storage::fake('s3');

        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Fidelity SMA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'is_reviewed' => true,
            'genai_status' => 'parsed',
            'parsed_data' => [
                'payer_name' => 'National Financial Services LLC',
                'account_number' => '637-768451',
                'div_1a_total_ordinary' => 100.12,
                'b_total_proceeds' => 1000.00,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_div', 2024, isReviewed: true, aiIdentifier: '637-768451', aiAccountName: 'Fidelity SMA');

        $response = $this->actingAs($user)->postJson("/api/finance/tax-documents/{$doc->id}/repair-format");

        $response->assertOk()
            ->assertJsonPath('genai_status', 'pending')
            ->assertJsonPath('is_reviewed', false)
            ->assertJsonPath('account_links.0.is_reviewed', false);

        $job = GenAiImportJob::latest('id')->first();
        $this->assertNotNull($job);
        $this->assertSame('document_extract', $job->job_type);
        $this->assertSame('text/plain', $job->mime_type);
        $this->assertSame('parsed_data_repair', $job->getContextArray()['input_kind']);
        $this->assertSame($doc->document_id, $job->getContextArray()['document_id']);
        $this->assertSame('tax_form', $job->getContextArray()['document_kind']);
        Storage::disk('s3')->assertExists($job->s3_path);
        $sourceText = Storage::disk('s3')->get($job->s3_path);
        $this->assertStringContainsString('div_1a_total_ordinary', $sourceText);
        $this->assertStringContainsString('b_total_proceeds', $sourceText);
        Queue::assertPushed(ParseImportJob::class);
    }

    public function test_broker_1099_matches_link_by_account_name_and_merges_repeated_warnings(): void
    {
        $user = $this->createUser();
        $targetAccount = $this->createFinAccount($user->id, 'Wealthfront S&P500 FLFF');
        $otherAccount = $this->createFinAccount($user->id, 'Wealthfront Cash');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => 'broker_1099',
            'account_id' => null,
            'parsed_data' => [
                [
                    'account_name' => 'Wealthfront S&P500 FLFF',
                    'form_type' => '1099_div',
                    'tax_year' => 2024,
                    'parsed_data' => [
                        'boxes' => [
                            '1a_total_ordinary_dividends' => 250.12,
                        ],
                    ],
                ],
                [
                    'account_name' => 'Wealthfront S&P500 FLFF',
                    'form_type' => '1099_div',
                    'tax_year' => 2024,
                    'parsed_data' => [
                        'box1b_qualified' => 225.10,
                    ],
                ],
            ],
        ]);
        $targetLink = TaxDocumentAccount::createLink(
            $doc->id,
            $targetAccount->acct_id,
            '1099_div',
            2024,
            aiAccountName: 'Wealthfront S&P500 FLFF',
        );
        TaxDocumentAccount::createLink(
            $doc->id,
            $otherAccount->acct_id,
            '1099_div',
            2024,
            aiAccountName: 'Wealthfront Cash',
        );

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}", [
            'notes' => 'Persist normalization flags',
        ]);

        $response->assertOk()
            ->assertJsonPath('parsed_data_needs_review', false)
            ->assertJsonPath('account_links.0.parsed_data_needs_review', true)
            ->assertJsonPath('account_links.0.parsed_data_warnings.0.code', 'canonicalized_alias')
            ->assertJsonCount(1, 'account_links.0.parsed_data_warnings')
            ->assertJsonPath('account_links.1.parsed_data_needs_review', false);

        $this->assertTrue((bool) $targetLink->fresh()->parsed_data_needs_review);
    }

    public function test_show_canonicalizes_noncanonical_1099_r_parsed_data_and_flags_review(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Rollover IRA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_r',
            'account_id' => $account->acct_id,
            'parsed_data' => [
                'payer_name' => 'IRA Custodian',
                'boxes' => [
                    '1_gross_distribution' => 50000,
                    '2a_taxable_amount' => 0,
                    '4_federal_income_tax_withheld' => 0,
                    'distribution_codes' => '1B',
                    'total_employee_contributions_or_designated_roth_contributions_or_insurance_premiums' => 1200,
                    'your_percentage_of_total_distribution' => 25,
                    'state_payer_state_no' => 'CA / 123456789',
                ],
                'ira_sep_simple' => false,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_r', 2024);

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.payer_name', 'IRA Custodian')
            ->assertJsonPath('parsed_data.box1_gross_distribution', 50000)
            ->assertJsonPath('parsed_data.box2a_taxable_amount', 0)
            ->assertJsonPath('parsed_data.box4_fed_tax', 0)
            ->assertJsonPath('parsed_data.box5_employee_contributions', 1200)
            ->assertJsonPath('parsed_data.box7_distribution_code', '1B')
            ->assertJsonPath('parsed_data.box7_ira_sep_simple', false)
            ->assertJsonPath('parsed_data.box9a_percentage', 25)
            ->assertJsonPath('parsed_data.box15_state', 'CA / 123456789')
            ->assertJsonPath('has_original_parsed_data', true)
            ->assertJsonPath('parsed_data_needs_review', true)
            ->assertJsonPath('parsed_data_warnings.0.code', 'canonicalized_alias');
    }

    public function test_show_canonicalizes_1099_r_code_g_rollover_with_zero_taxable_amount(): void
    {
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id, 'Rollover IRA');

        $doc = $this->createTaxDocument($user->id, [
            'form_type' => '1099_r',
            'account_id' => $account->acct_id,
            'parsed_data' => [
                'payer_name' => 'IRA Custodian',
                'gross_distribution' => 50000,
                'taxable_amount' => 0,
                'distribution_code' => 'G',
                'ira_sep_simple' => true,
            ],
        ]);
        TaxDocumentAccount::createLink($doc->id, $account->acct_id, '1099_r', 2024);

        $response = $this->actingAs($user)->getJson("/api/finance/tax-documents/{$doc->id}");

        $response->assertOk()
            ->assertJsonPath('parsed_data.box1_gross_distribution', 50000)
            ->assertJsonPath('parsed_data.box2a_taxable_amount', 0)
            ->assertJsonPath('parsed_data.box7_distribution_code', 'G')
            ->assertJsonPath('parsed_data.box7_ira_sep_simple', true)
            ->assertJsonPath('parsed_data_needs_review', true);
    }

    public function test_can_get_1099_r_prompt_info(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-documents/prompt?form_type=1099_r&tax_year=2025');

        $response->assertOk()
            ->assertJsonPath('form_label', '1099-R')
            ->assertJsonPath('json_schema.box1_gross_distribution.type', 'number')
            ->assertJsonPath('json_schema.box7_distribution_code.type', 'string');
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
