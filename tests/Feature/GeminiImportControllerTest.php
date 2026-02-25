<?php

namespace Tests\Feature;

use App\Models\FinStatementDetail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiImportControllerTest extends TestCase
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

    // ================================================================
    // parseDocument (transaction import) tests
    // ================================================================

    public function test_parse_document_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/transactions/import-gemini', []);
        $response->assertUnauthorized();
    }

    public function test_parse_document_validates_file_is_required(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $response = $this->actingAs($user)->postJson('/api/finance/transactions/import-gemini', []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('file');
    }

    public function test_parse_document_requires_gemini_api_key(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => null]);
        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'Gemini API key is not set.']);
    }

    public function test_parse_document_accepts_non_pdf_file(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        Http::fake(['*' => Http::response($this->geminiJsonResponse([
            'statementInfo' => ['brokerName' => 'Test'],
            'statementDetails' => [],
            'transactions' => [],
        ]), 200)]);

        $file = UploadedFile::fake()->create('test.txt', 100, 'text/plain');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertStatus(200);
    }

    public function test_parse_document_returns_gemini_data(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'statementInfo' => [
                'brokerName' => 'Test Bank',
                'periodStart' => '2025-01-01',
                'periodEnd' => '2025-01-31',
                'closingBalance' => 50000.00,
            ],
            'statementDetails' => [
                [
                    'section' => 'Summary',
                    'line_item' => 'Net Return',
                    'statement_period_value' => 1000,
                    'ytd_value' => 5000,
                    'is_percentage' => false,
                ],
            ],
            'transactions' => [
                ['date' => '2025-01-15', 'description' => 'Deposit', 'amount' => 1000, 'type' => 'deposit'],
            ],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiJsonResponse($data), 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertOk();
        $response->assertJson($data);
    }

    public function test_parse_document_caches_result_by_file_hash(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'statementInfo' => ['brokerName' => 'Cached Bank'],
            'statementDetails' => [],
            'transactions' => [],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiJsonResponse($data), 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        // First call should hit the API
        $response1 = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);
        $response1->assertOk();

        // Second call with same file should use cache (no additional HTTP request)
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => 'Should not be called'], 500),
        ]);

        $response2 = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);
        $response2->assertOk();
        $response2->assertJson($data);
    }

    public function test_parse_document_does_not_cache_errors(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'statementInfo' => ['brokerName' => 'Now Working'],
            'statementDetails' => [],
            'transactions' => [],
        ];

        // Use a sequence: first call returns 500, second returns 200
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push(['error' => 'server error'], 500)
                ->push($this->geminiJsonResponse($data), 200),
        ]);

        // Use a deterministic temp file so both requests produce the same hash
        $tmpPath = tempnam(sys_get_temp_dir(), 'gemini_test_');
        file_put_contents($tmpPath, 'deterministic-pdf-content-for-test');

        $file = new UploadedFile($tmpPath, 'statement.pdf', 'application/pdf', null, true);

        $response1 = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);
        $response1->assertStatus(500);

        // Verify nothing was cached
        $hash = hash('sha256', 'deterministic-pdf-content-for-test');
        $this->assertNull(Cache::get("gemini_import:transactions:{$hash}"));

        // Re-create the file (the previous upload consumed it)
        file_put_contents($tmpPath, 'deterministic-pdf-content-for-test');
        $file2 = new UploadedFile($tmpPath, 'statement.pdf', 'application/pdf', null, true);

        $response2 = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file2]);
        $response2->assertOk();
        $response2->assertJson($data);

        @unlink($tmpPath);
    }

    public function test_parse_document_handles_rate_limit(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(
                ['error' => ['message' => 'Rate limit']],
                429
            ),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertStatus(429);
        $response->assertJson(['error' => 'API rate limit exceeded. Please wait and try again.']);
    }

    public function test_parse_document_truncates_dates_to_iso(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $geminiResponse = $this->geminiJsonResponse([
            'statementInfo' => [
                'periodStart' => '2025-01-01T00:00:00Z',
                'periodEnd' => '2025-01-31T23:59:59-05:00',
            ],
            'transactions' => [
                ['date' => '2025-01-15T12:34:56Z', 'description' => 'X', 'amount' => 1],
            ],
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertOk();
        $json = $response->json();
        $this->assertEquals('2025-01-01', $json['statementInfo']['periodStart']);
        $this->assertEquals('2025-01-31', $json['statementInfo']['periodEnd']);
        $this->assertEquals('2025-01-15', $json['transactions'][0]['date']);
    }

    // ================================================================
    // importStatementDetails tests
    // ================================================================

    public function test_import_statement_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/statement/1/import-gemini', []);
        $response->assertUnauthorized();
    }

    public function test_import_statement_validates_file_is_required(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $response = $this->actingAs($user)->postJson('/api/finance/statement/1/import-gemini', []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors('file');
    }

    public function test_import_statement_returns_404_for_nonexistent_statement(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/statement/99999/import-gemini', ['file' => $file]);

        $response->assertStatus(404);
    }

    public function test_import_statement_returns_404_for_other_users_statement(): void
    {
        $owner = $this->createUser(['gemini_api_key' => 'test-key']);
        $otherUser = $this->createUser(['gemini_api_key' => 'test-key']);

        [, $stmtId] = $this->createAccountAndStatement($owner->id);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($otherUser)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertStatus(404);
    }

    public function test_import_statement_requires_gemini_api_key(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => null]);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertStatus(400);
        $response->assertJson(['error' => 'Gemini API key is not set.']);
    }

    public function test_import_statement_successfully_creates_details(): void
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
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertOk();
        $response->assertJson([
            'success' => true,
            'items_count' => 2,
        ]);

        $this->assertDatabaseCount('fin_statement_details', 2);

        $detail = FinStatementDetail::where('statement_id', $stmtId)
            ->where('section', 'Statement Summary ($)')
            ->first();

        $this->assertNotNull($detail);
        $this->assertEquals('Pre-Tax Return', $detail->line_item);
        $this->assertEquals(-23355.87, (float) $detail->statement_period_value);
    }

    public function test_import_statement_caches_gemini_response(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $geminiResponse = $this->geminiJsonResponse([
            ['section' => 'Summary', 'line_item' => 'Total', 'statement_period_value' => 100, 'ytd_value' => 200, 'is_percentage' => false],
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);
        $response->assertOk();

        // Verify the Gemini result was cached
        $fileContent = $file->get();
        $hash = hash('sha256', $fileContent);
        $this->assertNotNull(Cache::get("gemini_import:statement:{$hash}"));
    }

    public function test_import_statement_accepts_non_pdf_file(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake(['*' => Http::response($this->geminiJsonResponse([
            ['section' => 'Summary', 'line_item' => 'Total', 'statement_period_value' => 100, 'ytd_value' => 200, 'is_percentage' => false],
        ]), 200)]);

        $file = UploadedFile::fake()->create('test.txt', 100, 'text/plain');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertStatus(200);
    }

    public function test_import_statement_handles_rate_limit(): void
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
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertStatus(429);
    }

    public function test_import_statement_handles_malformed_json(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    ['content' => ['parts' => [['text' => 'Not valid JSON']]]],
                ],
            ], 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertStatus(500);
        $this->assertDatabaseCount('fin_statement_details', 0);
    }

    public function test_import_statement_skips_malformed_entries(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        [, $stmtId] = $this->createAccountAndStatement($user->id);

        $geminiResponse = $this->geminiJsonResponse([
            ['section' => 'Valid Section', 'line_item' => 'Valid Item', 'statement_period_value' => 100, 'ytd_value' => 200, 'is_percentage' => false],
            ['section' => '', 'line_item' => '', 'statement_period_value' => 0],
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($geminiResponse, 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson("/api/finance/statement/{$stmtId}/import-gemini", ['file' => $file]);

        $response->assertOk();
        $response->assertJson(['items_count' => 1]);
    }

    public function test_prompts_are_well_formed(): void
    {
        $controller = new \App\Http\Controllers\GeminiImportController;

        $transactionPrompt = $controller->getTransactionPrompt();
        $this->assertStringContainsString('statementInfo', $transactionPrompt);
        $this->assertStringContainsString('transactions', $transactionPrompt);
        $this->assertStringContainsString('statementDetails', $transactionPrompt);

        $statementPrompt = $controller->getStatementPrompt();
        $this->assertStringContainsString('JSON', $statementPrompt);
        $this->assertStringContainsString('section', $statementPrompt);
        $this->assertStringContainsString('line_item', $statementPrompt);
        $this->assertStringContainsString('is_percentage', $statementPrompt);
    }
}
