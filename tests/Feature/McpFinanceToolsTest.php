<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use Tests\TestCase;

/**
 * Tests for the MCP server tools via their underlying service/model logic.
 *
 * We test the API endpoints that the MCP tools delegate to (since the tools
 * call the same services/models the controllers use), and we test the
 * generate-mcp-api-key endpoint and Bearer-token middleware directly.
 */
class McpFinanceToolsTest extends TestCase
{
    // -------------------------------------------------------------------------
    // MCP API Key management
    // -------------------------------------------------------------------------

    public function test_generate_mcp_api_key_requires_auth(): void
    {
        $response = $this->postJson('/api/user/generate-mcp-api-key');
        $response->assertStatus(401);
    }

    public function test_generate_mcp_api_key_returns_64_char_hex(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/user/generate-mcp-api-key');

        $response->assertStatus(200);
        $response->assertJsonStructure(['message', 'mcp_api_key']);

        $key = $response->json('mcp_api_key');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $key);
    }

    public function test_generate_mcp_api_key_persists_to_database(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->postJson('/api/user/generate-mcp-api-key');
        $response->assertStatus(200);

        $key = $response->json('mcp_api_key');
        $user->refresh();

        $this->assertSame($key, $user->getAttributes()['mcp_api_key']);
    }

    public function test_regenerate_mcp_api_key_invalidates_old_key(): void
    {
        $user = $this->createUser();

        $first = $this->actingAs($user)->postJson('/api/user/generate-mcp-api-key')->json('mcp_api_key');
        $second = $this->actingAs($user)->postJson('/api/user/generate-mcp-api-key')->json('mcp_api_key');

        $this->assertNotSame($first, $second);

        $user->refresh();
        $this->assertSame($second, $user->getAttributes()['mcp_api_key']);
    }

    public function test_mcp_api_key_is_hidden_from_user_serialization(): void
    {
        $user = $this->createUser(['mcp_api_key' => 'secret-token-value']);

        $response = $this->actingAs($user)->getJson('/api/user');
        $response->assertStatus(200);

        // mcp_api_key must not appear; has_mcp_api_key should
        $response->assertJsonMissing(['mcp_api_key' => 'secret-token-value']);
        $response->assertJsonFragment(['has_mcp_api_key' => true]);
    }

    public function test_has_mcp_api_key_is_false_when_no_key_set(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/user');
        $response->assertStatus(200);
        $response->assertJsonFragment(['has_mcp_api_key' => false]);
    }

    // -------------------------------------------------------------------------
    // AuthenticateMcpRequest middleware
    // -------------------------------------------------------------------------

    public function test_mcp_http_endpoint_rejects_missing_token(): void
    {
        $response = $this->postJson('/mcp/finance');
        $response->assertStatus(401);
    }

    public function test_mcp_http_endpoint_rejects_invalid_token(): void
    {
        $response = $this->postJson('/mcp/finance', [], [
            'Authorization' => 'Bearer invalid-token-that-does-not-exist',
        ]);
        $response->assertStatus(401);
    }

    public function test_mcp_http_endpoint_accepts_valid_bearer_token(): void
    {
        $user = $this->createUser(['mcp_api_key' => 'valid-test-token-12345678901234567890']);

        // Sending a minimal JSON-RPC ping — the server will respond but we just want
        // to confirm the auth middleware does NOT return 401.
        $response = $this->postJson('/mcp/finance', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => 'tools/list',
        ], [
            'Authorization' => 'Bearer valid-test-token-12345678901234567890',
        ]);

        // Auth passed — should not be 401 (may be 200 or other MCP protocol response)
        $response->assertStatus(200);
    }

    // -------------------------------------------------------------------------
    // Tax Preview tool (via TaxPreviewDataController endpoint)
    // -------------------------------------------------------------------------

    public function test_tax_preview_endpoint_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/tax-preview-data');
        $response->assertStatus(401);
    }

    public function test_tax_preview_endpoint_returns_dataset(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user)->getJson('/api/finance/tax-preview-data?year=2024');

        $response->assertStatus(200);
        $response->assertJsonStructure(['year', 'availableYears']);
        $this->assertSame(2024, $response->json('year'));
    }

    // -------------------------------------------------------------------------
    // List Tax Documents tool (via TaxDocumentController endpoint)
    // -------------------------------------------------------------------------

    public function test_list_tax_documents_requires_auth(): void
    {
        $response = $this->getJson('/api/finance/tax-documents');
        $response->assertStatus(401);
    }

    public function test_list_tax_documents_returns_user_docs_only(): void
    {
        $userA = $this->createUser();
        $userB = $this->createUser();

        FileForTaxDocument::create([
            'user_id' => $userA->id,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'w2.pdf',
            'stored_filename' => 'w2_stored.pdf',
            's3_path' => 'tax_docs/1/w2_stored.pdf',
            'file_size_bytes' => 1024,
            'file_hash' => 'abc123',
            'uploaded_by_user_id' => $userA->id,
            'genai_status' => 'pending',
        ]);

        FileForTaxDocument::create([
            'user_id' => $userB->id,
            'tax_year' => 2024,
            'form_type' => '1099_int',
            'original_filename' => '1099.pdf',
            'stored_filename' => '1099_stored.pdf',
            's3_path' => 'tax_docs/2/1099_stored.pdf',
            'file_size_bytes' => 512,
            'file_hash' => 'def456',
            'uploaded_by_user_id' => $userB->id,
            'genai_status' => 'pending',
        ]);

        $response = $this->actingAs($userA)->getJson('/api/finance/tax-documents');

        $response->assertStatus(200);
        $docs = $response->json();
        $this->assertCount(1, $docs);
        $this->assertSame('w2', $docs[0]['form_type']);
    }

    public function test_list_tax_documents_filters_by_year(): void
    {
        $user = $this->createUser();

        foreach ([2023, 2024, 2024] as $i => $year) {
            FileForTaxDocument::create([
                'user_id' => $user->id,
                'tax_year' => $year,
                'form_type' => 'w2',
                'original_filename' => "w2_{$i}.pdf",
                'stored_filename' => "w2_{$i}_stored.pdf",
                's3_path' => "tax_docs/{$user->id}/w2_{$i}_stored.pdf",
                'file_size_bytes' => 1024,
                'file_hash' => "hash{$i}",
                'uploaded_by_user_id' => $user->id,
                'genai_status' => 'pending',
            ]);
        }

        $response = $this->actingAs($user)->getJson('/api/finance/tax-documents?year=2024');
        $response->assertStatus(200);
        $this->assertCount(2, $response->json());
    }

    public function test_list_tax_documents_filters_by_is_reviewed(): void
    {
        $user = $this->createUser();

        foreach ([true, false] as $i => $reviewed) {
            FileForTaxDocument::create([
                'user_id' => $user->id,
                'tax_year' => 2024,
                'form_type' => 'w2',
                'original_filename' => "w2_{$i}.pdf",
                'stored_filename' => "w2_{$i}_stored.pdf",
                's3_path' => "tax_docs/{$user->id}/w2_{$i}_stored.pdf",
                'file_size_bytes' => 1024,
                'file_hash' => "rhash{$i}",
                'uploaded_by_user_id' => $user->id,
                'is_reviewed' => $reviewed,
                'genai_status' => 'pending',
            ]);
        }

        $response = $this->actingAs($user)->getJson('/api/finance/tax-documents?is_reviewed=true');
        $response->assertStatus(200);
        $docs = $response->json();
        $this->assertCount(1, $docs);
        $this->assertTrue($docs[0]['is_reviewed']);
    }

    // -------------------------------------------------------------------------
    // List Tags tool (via FinanceTransactionTaggingApiController)
    // -------------------------------------------------------------------------

    public function test_list_tags_returns_user_tags_only(): void
    {
        $userA = $this->createUser();
        $userB = $this->createUser();

        FinAccountTag::create(['tag_userid' => $userA->id, 'tag_label' => 'Rent', 'tag_color' => 'red']);
        FinAccountTag::create(['tag_userid' => $userB->id, 'tag_label' => 'Food', 'tag_color' => 'green']);

        $response = $this->actingAs($userA)->getJson('/api/finance/tags');
        $response->assertStatus(200);

        $labels = collect($response->json('data'))->pluck('tag_label')->toArray();
        $this->assertContains('Rent', $labels);
        $this->assertNotContains('Food', $labels);
    }

    // -------------------------------------------------------------------------
    // List Accounts tool (via FinanceApiController)
    // -------------------------------------------------------------------------

    public function test_list_accounts_returns_only_user_accounts(): void
    {
        $userA = $this->createUser();
        $userB = $this->createUser();

        $this->actingAs($userA);
        FinAccounts::create(['acct_owner' => $userA->id, 'acct_name' => 'Checking A']);

        $this->actingAs($userB);
        FinAccounts::create(['acct_owner' => $userB->id, 'acct_name' => 'Checking B']);

        $response = $this->actingAs($userA)->getJson('/api/finance/accounts');
        $response->assertStatus(200);

        $names = collect($response->json('assetAccounts'))->pluck('acct_name')->toArray();
        $this->assertContains('Checking A', $names);
        $this->assertNotContains('Checking B', $names);
    }
}
