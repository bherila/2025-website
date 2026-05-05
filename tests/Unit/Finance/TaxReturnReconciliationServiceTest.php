<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\TaxReturnReconciliationService;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class TaxReturnReconciliationServiceTest extends TestCase
{
    public function test_reconciles_matching_lines_with_rounding_and_derived_paths(): void
    {
        $facts = [
            'year' => 2025,
            'schedule1' => [
                'line5Total' => -83357.0,
                'line9TotalOtherIncome' => 3842.89,
            ],
            'scheduleB' => [
                'interestTotal' => 36189.36,
            ],
            'form4952' => [
                'totalInvestmentInterestExpense' => 35073.62,
            ],
        ];
        $fixture = [
            'label' => 'Synthetic filed return',
            'year' => 2025,
            'lines' => [
                ['form' => 'Schedule 1', 'line' => '10', 'path' => 'schedule1.line10TotalAdditionalIncome', 'expected' => -79514, 'precision' => 0],
                ['form' => 'Schedule B', 'line' => '2', 'path' => 'scheduleB.interestTotal', 'expected' => 36189.36, 'precision' => 2],
                ['form' => 'Form 4952', 'line' => '1', 'path' => 'form4952.totalInvestmentInterestExpense', 'expected' => 35074, 'precision' => 0],
            ],
        ];

        $result = (new TaxReturnReconciliationService)->reconcile($facts, $fixture);

        $this->assertSame('pass', $result['summary']['status']);
        $this->assertSame(3, $result['summary']['matched']);
        $this->assertSame(-79514.0, $result['results'][0]['roundedActual']);
    }

    public function test_reports_mismatched_and_missing_lines(): void
    {
        $fixture = [
            'lines' => [
                ['form' => 'Schedule B', 'line' => '2', 'path' => 'scheduleB.interestTotal', 'expected' => 10, 'precision' => 0],
                ['form' => 'Schedule B', 'line' => '6', 'path' => 'scheduleB.ordinaryDividendTotal', 'expected' => 20, 'precision' => 0],
            ],
        ];

        $result = (new TaxReturnReconciliationService)->reconcile(['scheduleB' => ['interestTotal' => 11.0]], $fixture);

        $this->assertSame('fail', $result['summary']['status']);
        $this->assertSame(1, $result['summary']['mismatched']);
        $this->assertSame(1, $result['summary']['missing']);
        $this->assertSame('mismatched', $result['results'][0]['status']);
        $this->assertSame('missing', $result['results'][1]['status']);
    }

    public function test_rejects_fixture_without_valid_lines(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('must contain at least one valid line');

        (new TaxReturnReconciliationService)->reconcile(['year' => 2025], ['lines' => []]);
    }
}
