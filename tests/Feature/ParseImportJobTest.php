<?php

namespace Tests\Feature;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;
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
}
