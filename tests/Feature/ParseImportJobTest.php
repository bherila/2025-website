<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\UserAiConfiguration;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ParseImportJobTest extends TestCase
{
    public function test_extract_generate_content_data_reads_finance_tool_calls(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->extractGenerateContentData('finance_transactions', [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::FINANCE_ACCOUNT_TOOL_NAME,
                            'args' => [
                                'statementInfo' => [
                                    'brokerName' => 'Broker',
                                    'periodStart' => '2025-01-01T12:00:00Z',
                                    'periodEnd' => '2025-01-31 23:59:59',
                                    'closingBalance' => '(1,234.56)',
                                ],
                                'statementDetails' => [[
                                    'section' => 'Statement Summary ($)',
                                    'line_item' => 'Net Return',
                                    'statement_period_value' => '(1.25)',
                                    'ytd_value' => '2.50',
                                    'is_percentage' => false,
                                ]],
                                'transactions' => [[
                                    'date' => '2025-01-15 09:30:00',
                                    'description' => 'Deposit',
                                    'amount' => '100.75',
                                ]],
                                'lots' => [[
                                    'symbol' => 'AAPL',
                                    'quantity' => '1',
                                    'purchaseDate' => '2024-01-10T10:00:00Z',
                                    'saleDate' => '2025-01-20 16:00:00',
                                    'costBasis' => '50.10',
                                ]],
                            ],
                        ],
                    ]],
                ],
            ]],
        ]);

        $this->assertSame(['toolCalls'], array_keys($result));
        $this->assertCount(1, $result['toolCalls']);
        $this->assertSame('2025-01-01', $result['toolCalls'][0]['payload']['statementInfo']['periodStart']);
        $this->assertSame('2025-01-31', $result['toolCalls'][0]['payload']['statementInfo']['periodEnd']);
        $this->assertSame(-1234.56, $result['toolCalls'][0]['payload']['statementInfo']['closingBalance']);
        $this->assertSame(-1.25, $result['toolCalls'][0]['payload']['statementDetails'][0]['statement_period_value']);
        $this->assertSame('2025-01-15', $result['toolCalls'][0]['payload']['transactions'][0]['date']);
        $this->assertSame(100.75, $result['toolCalls'][0]['payload']['transactions'][0]['amount']);
        $this->assertSame('2024-01-10', $result['toolCalls'][0]['payload']['lots'][0]['purchaseDate']);
        $this->assertSame('2025-01-20', $result['toolCalls'][0]['payload']['lots'][0]['saleDate']);
    }

    public function test_extract_generate_content_data_normalizes_legacy_finance_json_to_tool_calls(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->extractGenerateContentData('finance_transactions', [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'text' => json_encode([
                            'accounts' => [
                                [
                                    'statementInfo' => [
                                        'brokerName' => 'Broker A',
                                        'periodStart' => '2025-01-01T00:00:00Z',
                                    ],
                                    'statementDetails' => [],
                                    'transactions' => [],
                                    'lots' => [],
                                ],
                                [
                                    'statementInfo' => [
                                        'brokerName' => 'Broker B',
                                        'periodStart' => '2025-02-01 12:00:00',
                                    ],
                                    'statementDetails' => [],
                                    'transactions' => [],
                                    'lots' => [],
                                ],
                            ],
                        ]),
                    ]],
                ],
            ]],
        ]);

        $this->assertCount(2, $result['toolCalls']);
        $this->assertSame('Broker A', $result['toolCalls'][0]['payload']['statementInfo']['brokerName']);
        $this->assertSame('2025-02-01', $result['toolCalls'][1]['payload']['statementInfo']['periodStart']);
    }

    public function test_extract_generate_content_data_drops_invalid_finance_rows_during_normalization(): void
    {
        $service = new GenAiJobDispatcherService;

        $result = $service->extractGenerateContentData('finance_transactions', [
            'candidates' => [[
                'content' => [
                    'parts' => [[
                        'functionCall' => [
                            'name' => GenAiJobDispatcherService::FINANCE_ACCOUNT_TOOL_NAME,
                            'args' => [
                                'statementInfo' => [
                                    'brokerName' => 'Broker',
                                ],
                                'statementDetails' => [
                                    [
                                        'section' => 'Statement Summary ($)',
                                        'line_item' => 'Net Return',
                                        'statement_period_value' => '10.5',
                                        'ytd_value' => '20.5',
                                        'is_percentage' => 'TRUE',
                                    ],
                                    [
                                        'section' => '',
                                        'line_item' => 'Invalid',
                                        'statement_period_value' => '1',
                                        'ytd_value' => '2',
                                        'is_percentage' => false,
                                    ],
                                ],
                                'transactions' => [
                                    [
                                        'date' => '2025-01-15 09:30:00',
                                        'description' => 'Deposit',
                                        'amount' => '100.75',
                                    ],
                                    [
                                        'date' => '2025-01-16',
                                        'amount' => '55.00',
                                    ],
                                ],
                                'lots' => [
                                    [
                                        'symbol' => 'AAPL',
                                        'quantity' => '1',
                                        'purchaseDate' => '2024-01-10T10:00:00Z',
                                        'costBasis' => '50.10',
                                    ],
                                    [
                                        'symbol' => '',
                                        'quantity' => '2',
                                        'purchaseDate' => '2024-01-11',
                                        'costBasis' => '20.10',
                                    ],
                                    [
                                        'symbol' => 'MSFT',
                                        'purchaseDate' => '2024-01-12',
                                        'costBasis' => '30.10',
                                    ],
                                ],
                            ],
                        ],
                    ]],
                ],
            ]],
        ]);

        $payload = $result['toolCalls'][0]['payload'];

        $this->assertSame([
            [
                'section' => 'Statement Summary ($)',
                'line_item' => 'Net Return',
                'statement_period_value' => 10.5,
                'ytd_value' => 20.5,
                'is_percentage' => true,
            ],
        ], $payload['statementDetails']);
        $this->assertSame([
            [
                'date' => '2025-01-15',
                'description' => 'Deposit',
                'amount' => 100.75,
            ],
        ], $payload['transactions']);
        $this->assertSame([
            [
                'symbol' => 'AAPL',
                'quantity' => 1.0,
                'purchaseDate' => '2024-01-10',
                'costBasis' => 50.1,
            ],
        ], $payload['lots']);
    }

    public function test_extract_token_usage_gemini_shape(): void
    {
        $job = new ParseImportJob(1);
        [$input, $output] = $job->extractTokenUsage([
            'usageMetadata' => [
                'promptTokenCount' => 1200,
                'candidatesTokenCount' => 350,
            ],
        ]);

        $this->assertSame(1200, $input);
        $this->assertSame(350, $output);
    }

    public function test_extract_token_usage_anthropic_shape(): void
    {
        $job = new ParseImportJob(1);
        [$input, $output] = $job->extractTokenUsage([
            'usage' => [
                'input_tokens' => 800,
                'output_tokens' => 200,
            ],
        ]);

        $this->assertSame(800, $input);
        $this->assertSame(200, $output);
    }

    public function test_extract_token_usage_bedrock_shape(): void
    {
        $job = new ParseImportJob(1);
        [$input, $output] = $job->extractTokenUsage([
            'usage' => [
                'inputTokens' => 600,
                'outputTokens' => 150,
            ],
        ]);

        $this->assertSame(600, $input);
        $this->assertSame(150, $output);
    }

    public function test_extract_token_usage_returns_nulls_for_unknown_shape(): void
    {
        $job = new ParseImportJob(1);
        [$input, $output] = $job->extractTokenUsage(['candidates' => []]);

        $this->assertNull($input);
        $this->assertNull($output);
    }

    public function test_extract_token_usage_handles_partial_output_only(): void
    {
        $job = new ParseImportJob(1);
        [$input, $output] = $job->extractTokenUsage([
            'usage' => ['output_tokens' => 99],
        ]);

        $this->assertNull($input);
        $this->assertSame(99, $output);
    }

    public function test_create_results_sanitizes_class_action_email_output(): void
    {
        $user = $this->createUser();

        $importJob = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'class_action_email',
            'file_hash' => 'hash-1',
            'original_filename' => 'pasted-import.txt',
            's3_path' => 'inline://paste/test',
            'mime_type' => 'text/plain',
            'file_size_bytes' => 123,
            'status' => 'processing',
        ]);

        $job = new ParseImportJob($importJob->id);
        $method = new \ReflectionMethod($job, 'createResults');
        $method->setAccessible(true);
        $method->invoke($job, $importJob, [
            'name' => '  Example Settlement  ',
            'claim_id' => 'ABC123',
            'pin' => 'PIN123',
            'claim_deadline' => '2026-08-27',
            'expected_payment_amount' => '42.50',
            'confidence' => [
                'claim_id' => 0.92,
                'ignored_field' => 0.9,
                'name' => 1.5,
            ],
            'unknown' => 'drop me',
        ]);

        $result = GenAiImportResult::query()->where('job_id', $importJob->id)->firstOrFail();
        $decoded = json_decode($result->result_json, true);

        $this->assertSame('Example Settlement', $decoded['name']);
        $this->assertSame('ABC123', $decoded['claim_id']);
        $this->assertSame('PIN123', $decoded['pin']);
        $this->assertSame('2026-08-27', $decoded['claim_deadline']);
        $this->assertSame(42.5, $decoded['expected_payment_amount']);
        $this->assertSame(['claim_id' => 0.92], $decoded['confidence']);
        $this->assertArrayNotHasKey('unknown', $decoded);
    }

    /**
     * Regression: Anthropic rejects inline document blocks whose media_type isn't application/pdf
     * (e.g. text/plain → invalid_request_error). Pasted-text jobs must send the email body inside
     * the prompt as a plain text content block, never as a base64 document attachment.
     */
    public function test_class_action_email_sends_text_only_request_to_anthropic(): void
    {
        Mail::fake();
        Http::fake([
            'api.anthropic.com/v1/messages' => Http::response([
                'id' => 'msg_test',
                'type' => 'message',
                'role' => 'assistant',
                'content' => [[
                    'type' => 'text',
                    'text' => json_encode([
                        'name' => 'LastPass Data Security Incident Settlement',
                        'claim_id' => 'TEST123',
                        'pin' => '4321',
                        'administrator' => null,
                        'defendant' => null,
                        'class_action_url' => null,
                        'notification_received_on' => null,
                        'claim_submitted_on' => null,
                        'claim_deadline' => '2026-07-02',
                        'final_approval_hearing_on' => '2026-07-14',
                        'payment_election_submitted_on' => null,
                        'expected_payment_on' => null,
                        'expected_payment_amount' => null,
                        'confidence' => ['claim_id' => 0.95],
                        'notes' => null,
                    ]),
                ]],
                'stop_reason' => 'end_turn',
                'usage' => ['input_tokens' => 1200, 'output_tokens' => 80],
            ]),
        ]);

        $user = $this->createUser(['gemini_api_key' => null]);
        UserAiConfiguration::factory()->active()->for($user)->anthropic()->create([
            'api_key' => 'sk-ant-test',
        ]);

        $importJob = GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => 'class_action_email',
            'file_hash' => str_repeat('c', 64),
            'original_filename' => 'pasted-import.txt',
            's3_path' => 'inline://paste/abc',
            'mime_type' => 'text/plain',
            'file_size_bytes' => 42,
            'context_json' => json_encode(['pasted_text' => 'Example email body with claim id TEST123 and PIN 4321.']),
            'status' => 'pending',
        ]);

        (new ParseImportJob($importJob->id))->handle(new GenAiJobDispatcherService);

        $importJob->refresh();
        $this->assertSame('parsed', $importJob->status, 'job error: '.$importJob->error_message);
        $this->assertSame('anthropic', $importJob->ai_provider);

        $result = GenAiImportResult::query()->where('job_id', $importJob->id)->firstOrFail();
        $decoded = json_decode($result->result_json, true);
        $this->assertSame('TEST123', $decoded['claim_id']);
        $this->assertSame('2026-07-02', $decoded['claim_deadline']);

        Http::assertSent(function (Request $request): bool {
            if (! str_contains($request->url(), 'api.anthropic.com/v1/messages')) {
                return false;
            }

            $payload = $request->data();
            $this->assertIsArray($payload['messages'] ?? null);
            $this->assertCount(1, $payload['messages']);

            $content = $payload['messages'][0]['content'] ?? [];
            $this->assertIsArray($content);
            // Must be a single text block — never a document/base64 attachment with text/plain.
            foreach ($content as $block) {
                $this->assertSame('text', $block['type'] ?? null, 'unexpected content block type sent to Anthropic: '.json_encode($block));
            }

            return true;
        });
    }
}
