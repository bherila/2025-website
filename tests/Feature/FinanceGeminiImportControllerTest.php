<?php

namespace Tests\Feature;

use App\Http\Controllers\FinanceTool\FinanceGeminiImportController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FinanceGeminiImportControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
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

        // Verify nothing was cached (key includes accounts context hash)
        $hash = hash('sha256', 'deterministic-pdf-content-for-test');
        $contextHash = hash('sha256', json_encode([]));
        $this->assertNull(Cache::get("gemini_import:transactions:{$hash}:{$contextHash}"));

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
        // Also check that the accounts array is present and normalized
        $this->assertArrayHasKey('accounts', $json);
        $this->assertCount(1, $json['accounts']);
        $this->assertEquals('2025-01-01', $json['accounts'][0]['statementInfo']['periodStart']);
        $this->assertEquals('2025-01-15', $json['accounts'][0]['transactions'][0]['date']);
    }

    public function test_parse_document_wraps_single_account_in_accounts_array(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'statementInfo' => ['brokerName' => 'Test Bank', 'accountNumber' => 'xxxx1234'],
            'statementDetails' => [],
            'transactions' => [
                ['date' => '2025-01-15', 'description' => 'Deposit', 'amount' => 1000],
            ],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiJsonResponse($data), 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertOk();
        $json = $response->json();
        // Single-account response is wrapped in accounts array
        $this->assertArrayHasKey('accounts', $json);
        $this->assertCount(1, $json['accounts']);
        $this->assertEquals('Test Bank', $json['accounts'][0]['statementInfo']['brokerName']);
        $this->assertEquals('xxxx1234', $json['accounts'][0]['statementInfo']['accountNumber']);
        $this->assertCount(1, $json['accounts'][0]['transactions']);
        // Top-level fields are preserved for backwards compatibility
        $this->assertEquals('Test Bank', $json['statementInfo']['brokerName']);
    }

    public function test_parse_document_returns_multi_account_response(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'accounts' => [
                [
                    'statementInfo' => ['brokerName' => 'Ally Bank', 'accountNumber' => 'xxxx1234', 'accountName' => 'Savings'],
                    'transactions' => [['date' => '2025-01-10', 'description' => 'Deposit', 'amount' => 500]],
                    'statementDetails' => [],
                    'lots' => [],
                ],
                [
                    'statementInfo' => ['brokerName' => 'Ally Bank', 'accountNumber' => 'xxxx5678', 'accountName' => 'Checking'],
                    'transactions' => [['date' => '2025-01-12', 'description' => 'Withdrawal', 'amount' => -100]],
                    'statementDetails' => [],
                    'lots' => [],
                ],
            ],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiJsonResponse($data), 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', ['file' => $file]);

        $response->assertOk();
        $json = $response->json();
        $this->assertArrayHasKey('accounts', $json);
        $this->assertCount(2, $json['accounts']);
        $this->assertEquals('xxxx1234', $json['accounts'][0]['statementInfo']['accountNumber']);
        $this->assertEquals('xxxx5678', $json['accounts'][1]['statementInfo']['accountNumber']);
    }

    public function test_parse_document_accepts_accounts_context(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);

        $data = [
            'statementInfo' => ['brokerName' => 'Test Bank'],
            'statementDetails' => [],
            'transactions' => [],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->geminiJsonResponse($data), 200),
        ]);

        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $accountsCtx = [
            ['name' => 'Savings Account', 'last4' => '1234'],
            ['name' => 'Checking Account', 'last4' => '5678'],
        ];

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', [
                'file' => $file,
                'accounts' => $accountsCtx,
            ]);

        $response->assertOk();
    }

    public function test_parse_document_validates_accounts_context(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        $file = UploadedFile::fake()->create('statement.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)
            ->postJson('/api/finance/transactions/import-gemini', [
                'file' => $file,
                'accounts' => [['name' => 'Missing last4']],  // missing 'last4'
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('accounts.0.last4');
    }

    public function test_prompt_is_well_formed(): void
    {
        $controller = new FinanceGeminiImportController;

        $transactionPrompt = $controller->getTransactionPrompt();
        $this->assertStringContainsString('statementInfo', $transactionPrompt);
        $this->assertStringContainsString('transactions', $transactionPrompt);
        $this->assertStringContainsString('statementDetails', $transactionPrompt);
        $this->assertStringContainsString('lots', $transactionPrompt);
        $this->assertStringContainsString('accounts', $transactionPrompt);
    }

    public function test_prompt_includes_accounts_context_when_provided(): void
    {
        $controller = new FinanceGeminiImportController;

        $accountsCtx = [
            ['name' => 'My Savings', 'last4' => '1234'],
            ['name' => 'My Checking', 'last4' => '5678'],
        ];

        $prompt = $controller->getTransactionPrompt($accountsCtx);
        $this->assertStringContainsString('My Savings: last 4 digits 1234', $prompt);
        $this->assertStringContainsString('My Checking: last 4 digits 5678', $prompt);
        $this->assertStringContainsString('Multi-account statements', $prompt);
    }

    public function test_normalize_multi_account_response_wraps_single_account(): void
    {
        $controller = new FinanceGeminiImportController;

        $input = [
            'statementInfo' => ['brokerName' => 'Test Bank'],
            'transactions' => [['date' => '2025-01-15', 'description' => 'Dep', 'amount' => 100]],
            'statementDetails' => [],
            'lots' => [],
        ];

        $result = $controller->normalizeMultiAccountResponse($input);
        $this->assertArrayHasKey('accounts', $result);
        $this->assertCount(1, $result['accounts']);
        $this->assertEquals('Test Bank', $result['accounts'][0]['statementInfo']['brokerName']);
        // Top-level fields preserved
        $this->assertEquals('Test Bank', $result['statementInfo']['brokerName']);
    }

    public function test_normalize_multi_account_response_preserves_multi_account(): void
    {
        $controller = new FinanceGeminiImportController;

        $input = [
            'accounts' => [
                ['statementInfo' => ['accountNumber' => 'xxxx1234'], 'transactions' => [], 'statementDetails' => [], 'lots' => []],
                ['statementInfo' => ['accountNumber' => 'xxxx5678'], 'transactions' => [], 'statementDetails' => [], 'lots' => []],
            ],
        ];

        $result = $controller->normalizeMultiAccountResponse($input);
        $this->assertCount(2, $result['accounts']);
        $this->assertEquals('xxxx1234', $result['accounts'][0]['statementInfo']['accountNumber']);
    }
}
