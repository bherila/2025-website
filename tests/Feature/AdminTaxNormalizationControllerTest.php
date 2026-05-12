<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTaxNormalizationControllerTest extends TestCase
{
    use RefreshDatabase;

    // ─── helpers ────────────────────────────────────────────────────────────

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
        return app(DocumentIngestionService::class)->createTaxFormDetail(array_merge([
            'user_id' => $userId,
            'tax_year' => 2024,
            'form_type' => '1099_div',
            'original_filename' => 'test-1099div.pdf',
            'stored_filename' => '2024.01.01 abc12 test-1099div.pdf',
            's3_path' => "tax_docs/{$userId}/2024.01.01 abc12 test-1099div.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 102400,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => false,
            'parsed_data_needs_review' => false,
        ], $overrides));
    }

    private function createAccountLink(FileForTaxDocument $doc, ?int $accountId, array $overrides = []): TaxDocumentAccount
    {
        $attributes = array_merge([
            'is_reviewed' => false,
            'parsed_data_needs_review' => false,
        ], $overrides);

        $link = TaxDocumentAccount::createLink(
            $doc->id,
            $accountId,
            (string) $doc->form_type,
            (int) $doc->tax_year,
            isReviewed: (bool) $attributes['is_reviewed'],
        );
        unset($attributes['tax_document_id'], $attributes['account_id'], $attributes['form_type'], $attributes['tax_year'], $attributes['is_reviewed']);

        if ($attributes !== []) {
            $link->update($attributes);
        }

        return $link->fresh() ?? $link;
    }

    // ─── auth / authorization ────────────────────────────────────────────────

    public function test_unauthenticated_cannot_list_review_items(): void
    {
        $response = $this->getJson('/api/admin/tax-normalization-review');
        $response->assertStatus(401);
    }

    public function test_non_admin_cannot_list_review_items(): void
    {
        // Create admin first so the regular user does not get ID 1 (which always has admin rights).
        $this->createAdminUser();
        $user = $this->createUser();
        $response = $this->actingAs($user)->getJson('/api/admin/tax-normalization-review');
        $response->assertStatus(403);
    }

    public function test_unauthenticated_cannot_acknowledge(): void
    {
        $response = $this->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'document',
            'document_id' => 1,
        ]);
        $response->assertStatus(401);
    }

    public function test_non_admin_cannot_acknowledge(): void
    {
        // Create admin first so the regular user does not get ID 1 (which always has admin rights).
        $this->createAdminUser();
        $user = $this->createUser();
        $response = $this->actingAs($user)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'document',
            'document_id' => 1,
        ]);
        $response->assertStatus(403);
    }

    // ─── index — basic listing ───────────────────────────────────────────────

    public function test_admin_can_list_empty_review_items(): void
    {
        $admin = $this->createAdminUser();
        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review');
        $response->assertOk()->assertJson([]);
    }

    public function test_returns_flagged_documents(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $doc = $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'bad_key']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.item_type', 'document')
            ->assertJsonPath('0.document_id', $doc->id)
            ->assertJsonPath('0.form_type', '1099_div')
            ->assertJsonPath('0.tax_year', 2024)
            ->assertJsonPath('0.warnings.0.code', 'unsupported_field')
            ->assertJsonPath('0.review_url', "/finance/tax-preview?year=2024&review_document_id={$doc->id}");
    }

    public function test_returns_flagged_account_links(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id);
        $link = $this->createAccountLink($doc, $account->acct_id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'canonicalized_alias', 'path' => 'old_key', 'canonical_key' => 'new_key']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.item_type', 'link')
            ->assertJsonPath('0.link_id', $link->id)
            ->assertJsonPath('0.document_id', $doc->id)
            ->assertJsonPath('0.warnings.0.code', 'canonicalized_alias')
            ->assertJsonPath('0.review_url', "/finance/tax-preview?year=2024&review_document_id={$doc->id}");
    }

    public function test_does_not_return_non_flagged_items(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $this->createTaxDocument($user->id, ['parsed_data_needs_review' => false]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review');
        $response->assertOk()->assertJson([]);
    }

    // ─── index — filtering ────────────────────────────────────────────────────

    public function test_filter_by_form_type(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $this->createTaxDocument($user->id, [
            'form_type' => '1099_div',
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'x']],
        ]);
        $this->createTaxDocument($user->id, [
            'form_type' => '1099_int',
            'original_filename' => 'int.pdf',
            'stored_filename' => '2024.01.01 int.pdf',
            's3_path' => "tax_docs/{$user->id}/2024.01.01 int.pdf",
            'file_hash' => str_repeat('b', 64),
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'y']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?form_type=1099_div');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.form_type', '1099_div');
    }

    public function test_filter_by_year(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $this->createTaxDocument($user->id, [
            'tax_year' => 2023,
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'x']],
        ]);
        $this->createTaxDocument($user->id, [
            'tax_year' => 2024,
            'original_filename' => '2024.pdf',
            'stored_filename' => '2024.01.01 2024.pdf',
            's3_path' => "tax_docs/{$user->id}/2024.01.01 2024.pdf",
            'file_hash' => str_repeat('c', 64),
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'y']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?year=2023');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.tax_year', 2023);
    }

    public function test_filter_by_warning_code_matches_any_warning_position(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $matchingDoc = $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [
                ['code' => 'ignored_field', 'path' => 'notes'],
                ['code' => 'unsupported_field', 'path' => 'unsupported'],
            ],
        ]);

        $nonMatchingDoc = $this->createTaxDocument($user->id, [
            'original_filename' => 'alias-only.pdf',
            'stored_filename' => '2024.01.01 alias-only.pdf',
            's3_path' => "tax_docs/{$user->id}/2024.01.01 alias-only.pdf",
            'file_hash' => str_repeat('d', 64),
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [
                ['code' => 'canonicalized_alias', 'path' => 'old_key', 'canonical_key' => 'new_key'],
            ],
        ]);

        $matchingLink = $this->createAccountLink($nonMatchingDoc, $account->acct_id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [
                ['code' => 'canonicalized_alias', 'path' => 'old_key'],
                ['code' => 'unsupported_field', 'path' => 'account_number'],
            ],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?warning_code=unsupported_field');

        $response->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.item_type', 'link')
            ->assertJsonPath('0.link_id', $matchingLink->id)
            ->assertJsonPath('1.item_type', 'document')
            ->assertJsonPath('1.document_id', $matchingDoc->id);

        $this->assertFalse(collect($response->json())->contains(
            fn (array $item): bool => $item['item_type'] === 'document' && $item['document_id'] === $nonMatchingDoc->id,
        ));
    }

    public function test_filter_by_warning_code_returns_empty_for_miss(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [
                ['code' => 'canonicalized_alias', 'path' => 'old_key', 'canonical_key' => 'new_key'],
            ],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?warning_code=unsupported_field');

        $response->assertOk()->assertJson([]);
    }

    public function test_filter_by_type_document_only(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'x']],
        ]);
        $this->createAccountLink($doc, $account->acct_id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'canonicalized_alias', 'path' => 'old']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?type=document');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.item_type', 'document');
    }

    public function test_filter_by_type_link_only(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'x']],
        ]);
        $this->createAccountLink($doc, $account->acct_id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'canonicalized_alias', 'path' => 'old']],
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/tax-normalization-review?type=link');
        $response->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.item_type', 'link');
    }

    // ─── acknowledge — documents ─────────────────────────────────────────────

    public function test_admin_can_acknowledge_document_flag(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();

        $doc = $this->createTaxDocument($user->id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'unsupported_field', 'path' => 'bad']],
        ]);

        $response = $this->actingAs($admin)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'document',
            'document_id' => $doc->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('item_type', 'document')
            ->assertJsonPath('id', $doc->id);

        $this->assertFalse((bool) $doc->fresh()->parsed_data_needs_review);
        $this->assertNull($doc->fresh()->parsed_data_warnings);
    }

    // ─── acknowledge — links ─────────────────────────────────────────────────

    public function test_admin_can_acknowledge_link_flag(): void
    {
        $admin = $this->createAdminUser();
        $user = $this->createUser();
        $account = $this->createFinAccount($user->id);

        $doc = $this->createTaxDocument($user->id);
        $link = $this->createAccountLink($doc, $account->acct_id, [
            'parsed_data_needs_review' => true,
            'parsed_data_warnings' => [['code' => 'canonicalized_alias', 'path' => 'old', 'canonical_key' => 'new']],
        ]);

        $response = $this->actingAs($admin)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'link',
            'link_id' => $link->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('item_type', 'link')
            ->assertJsonPath('id', $link->id);

        $this->assertFalse((bool) $link->fresh()->parsed_data_needs_review);
        $this->assertNull($link->fresh()->parsed_data_warnings);
    }

    public function test_acknowledge_returns_404_for_missing_document(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'document',
            'document_id' => 99999,
        ]);

        $response->assertStatus(404);
    }

    public function test_acknowledge_returns_404_for_missing_link(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'link',
            'link_id' => 99999,
        ]);

        $response->assertStatus(404);
    }

    public function test_acknowledge_validates_type_field(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->postJson('/api/admin/tax-normalization-review/acknowledge', [
            'type' => 'invalid',
            'document_id' => 1,
        ]);

        $response->assertStatus(422);
    }

    // ─── web route ───────────────────────────────────────────────────────────

    public function test_admin_can_view_web_page(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->get('/admin/tax-normalization-review');
        $response->assertOk();
    }

    public function test_non_admin_cannot_view_web_page(): void
    {
        // Create admin first so the regular user does not get ID 1 (which always has admin rights).
        $this->createAdminUser();
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/admin/tax-normalization-review');
        $response->assertStatus(403);
    }
}
