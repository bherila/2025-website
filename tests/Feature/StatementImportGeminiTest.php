<?php

namespace Tests\Feature;

use App\Models\FinStatementDetail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StatementImportGeminiTest extends TestCase
{
    use RefreshDatabase;

    private function createAccountAndStatement(int $userId): array
    {
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $userId,
            'acct_name' => 'Test Account',
            'acct_last_balance' => '100000',
        ]);

        $stmtId = DB::table('fin_statements')->insertGetId([
            'acct_id' => $acctId,
            'balance' => '100000',
            'statement_closing_date' => '2025-01-31',
        ]);

        return [$acctId, $stmtId];
    }

    private function geminiJsonResponse(array $items): array
    {
        return [
            'candidates' => [
                [
                    'content' => [
                        'parts' => [
                            ['text' => json_encode($items)],
                        ],
                    ],
                ],
            ],
        ];
    }

    public function test_import_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/statement/1/import-gemini', []);
        $response->assertUnauthorized();
    }

    public function test_import_validates_file_is_required(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $response = $this->actingAs($user)->postJson('/api/finance/statement/1/import-gemini', []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('file');
    }

    public function test_import_accepts_non_pdf_file(): void
    {
        // mimes:pdf removed because browsers may not send correct MIME type
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake(['*' => Http::response($this->geminiJsonResponse([
            ['section' => 'Summary', 'line_item' => 'Total', 'statement_period_value' => 100, 'ytd_value' => 200, 'is_percentage' => false],
        ]), 200)]);

        $file = UploadedFile::fake()->create('test.txt', 100, 'text/plain');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        // Should not be rejected based on MIME type
        $response->assertStatus(200);
    }

    public function test_import_returns_404_for_nonexistent_statement(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        Http::fake(['*' => Http::response($this->geminiJsonResponse([]), 200)]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/statement/99999/import-gemini', [
                'file' => $file,
            ]);

        $response->assertStatus(404);
    }

    public function test_import_returns_404_for_other_users_statement(): void
    {
        $owner = $this->createUser(['gemini_api_key' => 'test-key']);
        $otherUser = $this->createUser(['gemini_api_key' => 'test-key']);

        [, $stmtId] = $this->createAccountAndStatement($owner->id);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($otherUser)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertStatus(404);
    }

    public function test_import_requires_gemini_api_key(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => null]);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'Gemini API key is not set.']);
    }

    public function test_import_successfully_creates_statement_details(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $geminiResponse = $this->geminiJsonResponse([
            [
                'section' => 'Statement Summary ($)',
                'line_item' => 'Pre-Tax Return',
                'statement_period_value' => -23355.87,
                'ytd_value' => 12312.59,
                'is_percentage' => false,
            ],
            [
                'section' => 'Statement Summary (%)',
                'line_item' => 'Pre-Tax Return',
                'statement_period_value' => -1.75,
                'ytd_value' => 1.76,
                'is_percentage' => true,
            ],
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertOk();
        $response->assertJson([
            'success' => true,
            'items_count' => 2,
        ]);

        // Verify database records
        $this->assertDatabaseCount('fin_statement_details', 2);

        $detail = FinStatementDetail::where('statement_id', $stmtId)
            ->where('section', 'Statement Summary ($)')
            ->first();

        $this->assertNotNull($detail);
        $this->assertEquals('Pre-Tax Return', $detail->line_item);
        $this->assertEquals(-23355.87, (float) $detail->statement_period_value);
        $this->assertEquals(12312.59, (float) $detail->ytd_value);
    }

    public function test_import_handles_single_object_response(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        // Return a single object instead of an array
        $geminiResponse = $this->geminiJsonResponse([
            'section' => 'Summary',
            'line_item' => 'Net Return',
            'statement_period_value' => 1000.50,
            'ytd_value' => 5000.00,
            'is_percentage' => false,
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertOk();
        $response->assertJson(['success' => true, 'items_count' => 1]);
        $this->assertDatabaseCount('fin_statement_details', 1);
    }

    public function test_import_handles_gemini_rate_limit(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(
                ['error' => ['message' => 'Rate limit exceeded']],
                429
            ),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertStatus(429);
        $response->assertJson(['error' => 'API rate limit exceeded. Please wait and try again.']);
    }

    public function test_import_handles_gemini_server_error(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(
                ['error' => ['message' => 'Internal error']],
                500
            ),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertStatus(500);
        $response->assertJson(['error' => 'Failed to import statement data.']);
    }

    public function test_import_handles_malformed_json_response(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                ['text' => 'This is not valid JSON'],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertStatus(500);
        $response->assertJson(['error' => 'Failed to parse statement data from AI response.']);
        $this->assertDatabaseCount('fin_statement_details', 0);
    }

    public function test_import_skips_malformed_entries_without_section_or_line_item(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $geminiResponse = $this->geminiJsonResponse([
            [
                'section' => 'Valid Section',
                'line_item' => 'Valid Item',
                'statement_period_value' => 100,
                'ytd_value' => 200,
                'is_percentage' => false,
            ],
            [
                'section' => '',
                'line_item' => '',
                'statement_period_value' => 0,
            ],
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", [
                'file' => $file,
            ]);

        $response->assertOk();
        $response->assertJson(['items_count' => 1]);
        $this->assertDatabaseCount('fin_statement_details', 1);
    }

    public function test_prompt_is_well_formed(): void
    {
        $controller = new \App\Http\Controllers\StatementImportGeminiController;
        $prompt = $controller->getPrompt();

        $this->assertStringContainsString('JSON', $prompt);
        $this->assertStringContainsString('section', $prompt);
        $this->assertStringContainsString('line_item', $prompt);
        $this->assertStringContainsString('is_percentage', $prompt);
    }
}
