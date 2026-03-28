<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use ReflectionMethod;
use Tests\TestCase;

class ParseImportJobTest extends TestCase
{
    public function test_normalize_multi_account_response_returns_unified_accounts_array(): void
    {
        $job = new ParseImportJob(1);
        $method = new ReflectionMethod(ParseImportJob::class, 'normalizeMultiAccountResponse');
        $method->setAccessible(true);

        $result = $method->invoke($job, [
            'statementInfo' => [
                'brokerName' => 'Broker',
                'periodStart' => '2025-01-01T12:00:00Z',
                'periodEnd' => '2025-01-31 23:59:59',
            ],
            'statementDetails' => [
                [
                    'section' => 'Statement Summary ($)',
                    'line_item' => 'Net Return',
                    'statement_period_value' => 1,
                    'ytd_value' => 2,
                    'is_percentage' => false,
                ],
            ],
            'transactions' => [
                [
                    'date' => '2025-01-15 09:30:00',
                    'description' => 'Deposit',
                    'amount' => 100,
                ],
            ],
            'lots' => [
                [
                    'symbol' => 'AAPL',
                    'quantity' => 1,
                    'purchaseDate' => '2024-01-10T10:00:00Z',
                    'saleDate' => '2025-01-20 16:00:00',
                ],
            ],
        ]);

        $this->assertSame(['accounts'], array_keys($result));
        $this->assertCount(1, $result['accounts']);
        $this->assertSame('2025-01-01', $result['accounts'][0]['statementInfo']['periodStart']);
        $this->assertSame('2025-01-31', $result['accounts'][0]['statementInfo']['periodEnd']);
        $this->assertSame('2025-01-15', $result['accounts'][0]['transactions'][0]['date']);
        $this->assertSame('2024-01-10', $result['accounts'][0]['lots'][0]['purchaseDate']);
        $this->assertSame('2025-01-20', $result['accounts'][0]['lots'][0]['saleDate']);
    }
}
