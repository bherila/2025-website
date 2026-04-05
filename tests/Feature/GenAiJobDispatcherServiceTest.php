<?php

namespace Tests\Feature;

use App\GenAiProcessor\Models\GenAiDailyQuota;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use Tests\TestCase;

class GenAiJobDispatcherServiceTest extends TestCase
{
    // ================================================================
    // claimQuota tests
    // ================================================================

    public function test_claim_quota_succeeds_when_under_limit(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        // Default limit is 500
        $result = $service->claimQuota($user->id);
        $this->assertTrue($result);

        // Check the quota was incremented
        $today = now()->utc()->toDateString();
        $quota = GenAiDailyQuota::find($today);
        $this->assertNotNull($quota);
        $this->assertEquals(1, $quota->request_count);
    }

    public function test_claim_quota_fails_when_limit_reached(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        // Set quota to the site-wide limit (500)
        GenAiDailyQuota::create([
            'usage_date' => $today,
            'request_count' => 500,
        ]);

        $result = $service->claimQuota($user->id);
        $this->assertFalse($result);
    }

    public function test_claim_quota_fails_when_per_user_limit_reached(): void
    {
        // Set a per-user limit of 2
        $user = $this->createUser(['genai_daily_quota_limit' => 2]);
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        // Simulate 2 completed jobs today for this user
        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'abc123',
            'original_filename' => 'test.pdf',
            's3_path' => 'genai-import/1/test.pdf',
            'file_size_bytes' => 1000,
            'status' => 'parsed',
        ]);
        GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'finance_transactions',
            'file_hash' => 'def456',
            'original_filename' => 'test2.pdf',
            's3_path' => 'genai-import/1/test2.pdf',
            'file_size_bytes' => 1000,
            'status' => 'parsed',
        ]);

        $result = $service->claimQuota($user->id, $user);
        $this->assertFalse($result);
    }

    public function test_claim_quota_increments_count(): void
    {
        $user = $this->createUser();
        $service = new GenAiJobDispatcherService;

        $today = now()->utc()->toDateString();

        GenAiDailyQuota::create([
            'usage_date' => $today,
            'request_count' => 5,
        ]);

        $result = $service->claimQuota($user->id);
        $this->assertTrue($result);

        $quota = GenAiDailyQuota::find($today);
        $this->assertEquals(6, $quota->request_count);
    }

    // ================================================================
    // validateContext tests
    // ================================================================

    public function test_validate_context_allows_null(): void
    {
        $service = new GenAiJobDispatcherService;
        $this->assertTrue($service->validateContext('finance_transactions', null));
    }

    public function test_validate_context_rejects_unexpected_keys(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Unexpected context keys/');
        $service->validateContext('finance_transactions', ['malicious_key' => 'value']);
    }

    public function test_validate_context_accepts_valid_finance_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('finance_transactions', [
            'accounts' => [
                ['name' => 'Savings', 'last4' => '1234'],
            ],
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_rejects_invalid_account_last4(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Account last4 must be at most 4 characters');
        $service->validateContext('finance_transactions', [
            'accounts' => [
                ['name' => 'Savings', 'last4' => '12345'],
            ],
        ]);
    }

    public function test_validate_context_accepts_valid_payslip_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('finance_payslip', [
            'employment_entity_id' => 1,
            'file_count' => 3,
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_accepts_valid_utility_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('utility_bill', [
            'account_type' => 'Electricity',
            'utility_account_id' => 5,
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_rejects_unknown_job_type(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown job type');
        $service->validateContext('unknown_type', ['key' => 'value']);
    }

    // ================================================================
    // buildPrompt tests
    // ================================================================

    public function test_build_prompt_for_finance_transactions(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_transactions', []);
        $this->assertStringContainsString('addFinanceAccount', $prompt);
        $this->assertStringContainsString('{"accounts":[ACCOUNT,...]}', $prompt);
        $this->assertStringContainsString('Statement detail section mappings', $prompt);
        $this->assertStringContainsString('transactions', $prompt);
        $this->assertStringContainsString('lots', $prompt);
        $this->assertStringNotContainsString('single-account', $prompt);
        $this->assertStringNotContainsString('```json', $prompt);
    }

    public function test_build_prompt_for_finance_transactions_with_accounts(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_transactions', [
            'accounts' => [
                ['name' => 'My Savings', 'last4' => '1234'],
            ],
        ]);
        $this->assertStringContainsString('Known user accounts', $prompt);
        $this->assertStringContainsString('My Savings: last 4 digits 1234', $prompt);
        $this->assertStringContainsString('{"accounts":[ACCOUNT,...]}', $prompt);
    }

    public function test_build_generate_content_payload_uses_tool_calling_for_finance_transactions(): void
    {
        $service = new GenAiJobDispatcherService;

        $payload = $service->buildGenerateContentPayload(
            'finance_transactions',
            'files/abc123',
            'application/pdf',
            'Prompt'
        );

        $this->assertArrayHasKey('tools', $payload);
        $this->assertArrayHasKey('toolConfig', $payload);
        $this->assertSame(
            GenAiJobDispatcherService::FINANCE_ACCOUNT_TOOL_NAME,
            $payload['tools'][0]['function_declarations'][0]['name']
        );
        $this->assertSame('ANY', $payload['toolConfig']['functionCallingConfig']['mode']);
        $this->assertArrayNotHasKey('generationConfig', $payload);
    }

    public function test_build_prompt_for_payslip(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('finance_payslip', ['file_count' => 2]);
        $this->assertStringContainsString('payslip', $prompt);
        $this->assertStringContainsString('period_start', $prompt);
        $this->assertStringContainsString('earnings_gross', $prompt);
    }

    public function test_build_prompt_for_utility_bill(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('utility_bill', ['account_type' => 'Electricity']);
        $this->assertStringContainsString('utility bill', $prompt);
        $this->assertStringContainsString('power_consumed_kwh', $prompt);
    }

    public function test_build_prompt_for_utility_bill_non_electric(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('utility_bill', ['account_type' => 'Water']);
        $this->assertStringContainsString('utility bill', $prompt);
        $this->assertStringNotContainsString('power_consumed_kwh', $prompt);
    }

    public function test_build_prompt_rejects_unknown_job_type(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $service->buildPrompt('unknown_type', []);
    }

    // ================================================================
    // tax_document context validation and prompt tests
    // ================================================================

    public function test_validate_context_accepts_valid_tax_document_context(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->validateContext('tax_document', [
            'tax_year' => 2024,
            'form_type' => 'w2',
            'tax_document_id' => 1,
        ]);
        $this->assertTrue($result);
    }

    public function test_validate_context_rejects_unexpected_tax_document_keys(): void
    {
        $service = new GenAiJobDispatcherService;

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Unexpected context keys/');
        $service->validateContext('tax_document', ['invalid_key' => 'value']);
    }

    public function test_build_prompt_for_w2(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('tax_document', ['form_type' => 'w2', 'tax_year' => 2024]);
        $this->assertStringContainsString('W-2', $prompt);
        $this->assertStringContainsString(GenAiJobDispatcherService::TAX_DOCUMENT_W2_TOOL_NAME, $prompt);
        $this->assertStringContainsString('2024', $prompt);
    }

    public function test_build_prompt_for_1099_int(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('tax_document', ['form_type' => '1099_int', 'tax_year' => 2024]);
        $this->assertStringContainsString('1099-INT', $prompt);
        $this->assertStringContainsString(GenAiJobDispatcherService::TAX_DOCUMENT_1099INT_TOOL_NAME, $prompt);
    }

    public function test_build_prompt_for_1099_div(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('tax_document', ['form_type' => '1099_div', 'tax_year' => 2024]);
        $this->assertStringContainsString('1099-DIV', $prompt);
        $this->assertStringContainsString(GenAiJobDispatcherService::TAX_DOCUMENT_1099DIV_TOOL_NAME, $prompt);
    }

    public function test_build_generate_content_payload_uses_tool_calling_for_w2(): void
    {
        $service = new GenAiJobDispatcherService;

        $prompt = $service->buildPrompt('tax_document', ['form_type' => 'w2', 'tax_year' => 2024]);
        $payload = $service->buildGenerateContentPayload('tax_document', 'files/abc123', 'application/pdf', $prompt);

        $this->assertArrayHasKey('tools', $payload);
        $this->assertArrayHasKey('toolConfig', $payload);
        $this->assertSame(
            GenAiJobDispatcherService::TAX_DOCUMENT_W2_TOOL_NAME,
            $payload['tools'][0]['function_declarations'][0]['name']
        );
        $this->assertSame('ANY', $payload['toolConfig']['functionCallingConfig']['mode']);
        $this->assertArrayNotHasKey('generationConfig', $payload);
    }

    public function test_extract_tax_document_data_from_tool_call_response(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::TAX_DOCUMENT_W2_TOOL_NAME,
                            'args' => [
                                'employer_name' => 'Acme Corp',
                                'box1_wages' => 75000.00,
                                'box2_fed_tax' => 10000.00,
                                'box12_codes' => [['code' => 'DD', 'amount' => 1500.00]],
                                'box13_retirement' => true,
                            ],
                        ],
                    ]],
                ],
            ]],
        ];

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertIsArray($data);
        $this->assertEquals('Acme Corp', $data['employer_name']);
        $this->assertEquals(75000.0, $data['box1_wages']);
        $this->assertEquals(10000.0, $data['box2_fed_tax']);
        $this->assertIsArray($data['box12_codes']);
        $this->assertEquals('DD', $data['box12_codes'][0]['code']);
        $this->assertTrue($data['box13_retirement']);
    }

    public function test_coerce_tax_document_args_converts_string_numbers(): void
    {
        $service = new GenAiJobDispatcherService;

        // Simulate Gemini returning a string for a number field
        $response = [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::TAX_DOCUMENT_1099INT_TOOL_NAME,
                            'args' => [
                                'payer_name' => 'First National Bank',
                                'box1_interest' => '523.45', // string instead of number
                                'box4_fed_tax' => null,
                            ],
                        ],
                    ]],
                ],
            ]],
        ];

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertIsArray($data);
        $this->assertSame(523.45, $data['box1_interest']); // should be cast to float
        $this->assertNull($data['box4_fed_tax']);
    }

    // ================================================================
    // K-1 structured coercion tests
    // ================================================================

    private function buildK1ToolResponse(array $args): array
    {
        return [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::TAX_DOCUMENT_K1_TOOL_NAME,
                            'args' => $args,
                        ],
                    ]],
                ],
            ]],
        ];
    }

    public function test_k1_coercion_produces_schema_version_and_form_type(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'formType' => 'K-1-1065',
            'field_A' => '12-3456789',
            'field_1' => 15000.0,
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertIsArray($data);
        $this->assertSame('2026.1', $data['schemaVersion']);
        $this->assertSame('K-1-1065', $data['formType']);
        $this->assertArrayHasKey('fields', $data);
        $this->assertArrayHasKey('codes', $data);
    }

    public function test_k1_coercion_populates_string_fields(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'field_A' => '12-3456789',
            'field_B' => "Acme Partners\n123 Main St",
            'field_C' => 'Ogden',
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertSame('12-3456789', $data['fields']['A']['value']);
        $this->assertSame("Acme Partners\n123 Main St", $data['fields']['B']['value']);
        $this->assertSame('Ogden', $data['fields']['C']['value']);
    }

    public function test_k1_coercion_omits_null_fields(): void
    {
        $service = new GenAiJobDispatcherService;

        // Only provide field_A; field_B is absent
        $response = $this->buildK1ToolResponse(['field_A' => '12-3456789']);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayHasKey('A', $data['fields']);
        $this->assertArrayNotHasKey('B', $data['fields']);
    }

    public function test_k1_coercion_handles_boolean_true(): void
    {
        $service = new GenAiJobDispatcherService;

        $cases = [true, 1, 'true', '1', 'TRUE'];

        foreach ($cases as $value) {
            $response = $this->buildK1ToolResponse(['field_D' => $value]);
            $data = $service->extractGenerateContentData('tax_document', $response);
            $this->assertSame('true', $data['fields']['D']['value'], "Expected 'true' for input: ".var_export($value, true));
        }
    }

    public function test_k1_coercion_handles_boolean_false(): void
    {
        $service = new GenAiJobDispatcherService;

        $cases = [false, 0, 'false', '0', 'FALSE'];

        foreach ($cases as $value) {
            $response = $this->buildK1ToolResponse(['field_D' => $value]);
            $data = $service->extractGenerateContentData('tax_document', $response);
            $this->assertSame('false', $data['fields']['D']['value'], "Expected 'false' for input: ".var_export($value, true));
        }
    }

    public function test_k1_coercion_omits_boolean_field_when_null(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([]);
        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayNotHasKey('D', $data['fields']);
        $this->assertArrayNotHasKey('H2', $data['fields']);
    }

    public function test_k1_coercion_populates_numeric_fields(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'field_1' => 15000.50,
            'field_5' => '2500.00',   // string from Gemini
            'field_12' => 0,
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertSame('15000.5', $data['fields']['1']['value']);
        $this->assertSame('2500', $data['fields']['5']['value']);
        $this->assertSame('0', $data['fields']['12']['value']);
    }

    public function test_k1_coercion_normalizes_code_items(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'codes_13' => [
                ['code' => 'G', 'value' => 200.0, 'notes' => 'Investment interest'],
                ['code' => 'A', 'value' => 500.0],
            ],
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayHasKey('13', $data['codes']);
        $this->assertCount(2, $data['codes']['13']);
        $this->assertSame('G', $data['codes']['13'][0]['code']);
        $this->assertSame('200', $data['codes']['13'][0]['value']);
        $this->assertSame('Investment interest', $data['codes']['13'][0]['notes']);
        $this->assertSame('A', $data['codes']['13'][1]['code']);
        $this->assertSame('', $data['codes']['13'][1]['notes']);
    }

    public function test_k1_coercion_omits_empty_coded_boxes(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'codes_11' => [],
            'codes_13' => [['code' => 'G', 'value' => 200.0]],
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayNotHasKey('11', $data['codes']);
        $this->assertArrayHasKey('13', $data['codes']);
    }

    public function test_k1_coercion_normalizes_k3_sections(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'k3_sections' => [
                ['sectionId' => 'K3-1', 'title' => 'Foreign Source Income', 'notes' => 'Passive'],
            ],
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayHasKey('k3', $data);
        $this->assertCount(1, $data['k3']['sections']);
        $this->assertSame('K3-1', $data['k3']['sections'][0]['sectionId']);
        $this->assertSame('Passive', $data['k3']['sections'][0]['notes']);
        // data must be an object (empty stdClass), not an array
        $this->assertIsObject($data['k3']['sections'][0]['data']);
    }

    public function test_k1_coercion_stamps_extraction_metadata(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse(['field_A' => 'test']);
        $data = $service->extractGenerateContentData('tax_document', $response);

        $this->assertArrayHasKey('extraction', $data);
        $this->assertSame('gemini', $data['extraction']['model']);
        $this->assertSame('2026.1', $data['extraction']['version']);
        $this->assertSame('ai', $data['extraction']['source']);
        $this->assertNotEmpty($data['extraction']['timestamp']);
    }

    public function test_k1_coercion_drops_invalid_code_items(): void
    {
        $service = new GenAiJobDispatcherService;

        $response = $this->buildK1ToolResponse([
            'codes_20' => [
                ['code' => 'V', 'value' => 100.0],
                'not-an-array',               // should be dropped
                ['value' => 200.0],           // missing code → should be dropped
            ],
        ]);

        $data = $service->extractGenerateContentData('tax_document', $response);
        $this->assertArrayHasKey('20', $data['codes']);
        $this->assertCount(1, $data['codes']['20']);
        $this->assertSame('V', $data['codes']['20'][0]['code']);
    }
}
