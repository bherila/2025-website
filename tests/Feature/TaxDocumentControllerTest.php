<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
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
        return FinAccounts::withoutGlobalScopes()->create([
            'acct_owner' => $userId,
            'acct_name' => $name,
        ]);
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
            'is_reconciled' => false,
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

    public function test_can_update_reconciled_status(): void
    {
        $user = $this->createUser();
        $doc = $this->createTaxDocument($user->id, ['is_reconciled' => false]);

        $response = $this->actingAs($user)->putJson("/api/finance/tax-documents/{$doc->id}/reconciled", [
            'is_reconciled' => true,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('fin_tax_documents', ['id' => $doc->id, 'is_reconciled' => 1]);
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
}
