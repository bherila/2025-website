<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\TaxPreviewDataService;
use App\Services\Finance\TaxReturnLineComparisonService;
use PHPUnit\Framework\TestCase;

class TaxReturnLineComparisonServiceTest extends TestCase
{
    private function service(?TaxPreviewDataService $dataService = null): TaxReturnLineComparisonService
    {
        return new TaxReturnLineComparisonService(
            $dataService ?? $this->createMock(TaxPreviewDataService::class),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function sourceRow(string $id, ?string $routing, float $amount): array
    {
        return [
            'id' => $id,
            'label' => 'Synthetic source '.$id,
            'amount' => $amount,
            'sourceType' => 'w2_wages',
            'routing' => $routing,
        ];
    }

    // -------------------------------------------------------------------
    // normalizeKey
    // -------------------------------------------------------------------

    public function test_normalize_key_maps_bare_form_numbers_and_lines(): void
    {
        $service = $this->service();

        $this->assertSame('form_1040_line_1z', $service->normalizeKey('1040', '1z'));
        $this->assertSame('form_1040_line_1z', $service->normalizeKey('Form 1040', 'Line 1z'));
        $this->assertSame('form_4952_line_1', $service->normalizeKey('4952', '1'));
        $this->assertSame('form_8960_line_4a', $service->normalizeKey('Form 8960', '4a'));
    }

    public function test_normalize_key_maps_schedule_variants(): void
    {
        $service = $this->service();

        $this->assertSame('schedule_d_line_5', $service->normalizeKey('Schedule D', '5'));
        $this->assertSame('schedule_d_line_5', $service->normalizeKey('Sch D', '5'));
        $this->assertSame('schedule_d_line_5', $service->normalizeKey('sch. d', 'line 5'));
        $this->assertSame('schedule_1_line_5', $service->normalizeKey('Schedule 1', '5'));
        $this->assertSame('schedule_se_line_2', $service->normalizeKey('Schedule SE', '2'));
    }

    public function test_normalize_key_resolves_legacy_schedule_1_aliases(): void
    {
        $this->assertSame('sch_1_8b', $this->service()->normalizeKey('Schedule 1', '8b'));
    }

    public function test_normalize_key_returns_null_for_unknown_keys(): void
    {
        $service = $this->service();

        $this->assertNull($service->normalizeKey('Form 9999', '1'));
        $this->assertNull($service->normalizeKey('1040', 'zz9'));
        $this->assertNull($service->normalizeKey('', '1z'));
        $this->assertNull($service->normalizeKey('1040', ''));
    }

    // -------------------------------------------------------------------
    // routingTotalsCents
    // -------------------------------------------------------------------

    public function test_routing_totals_sums_sources_grouped_by_routing_in_integer_cents(): void
    {
        $taxFacts = [
            'form1040' => [
                'line1zSources' => [
                    $this->sourceRow('w2-1', 'form_1040_line_1z', 1000.00),
                    $this->sourceRow('w2-2', 'form_1040_line_1z', 234.56),
                ],
                'line1z' => 1234.56,
            ],
            'scheduleB' => [
                'line1Sources' => [
                    $this->sourceRow('int-1', 'schedule_b_line_1', 0.105),
                ],
            ],
        ];

        $totals = $this->service()->routingTotalsCents($taxFacts);

        $this->assertSame(123456, $totals['form_1040_line_1z']);
        $this->assertSame(11, $totals['schedule_b_line_1']);
    }

    public function test_routing_totals_dedupes_sources_relisted_under_multiple_collections(): void
    {
        $shared = $this->sourceRow('sch1-line5', 'schedule_1_line_5', 500.00);
        $taxFacts = [
            'schedule1' => ['line5Sources' => [$shared]],
            'form1040' => ['line8Sources' => [$shared]],
        ];

        $totals = $this->service()->routingTotalsCents($taxFacts);

        $this->assertSame(50000, $totals['schedule_1_line_5']);
    }

    public function test_routing_totals_ignores_sources_without_routing(): void
    {
        $taxFacts = [
            'form1040' => [
                'line1zSources' => [$this->sourceRow('w2-1', null, 999.99)],
            ],
        ];

        $this->assertSame([], $this->service()->routingTotalsCents($taxFacts));
    }

    // -------------------------------------------------------------------
    // compare
    // -------------------------------------------------------------------

    public function test_compare_classifies_matched_different_and_missing(): void
    {
        $previewTotals = [
            'form_1040_line_1z' => 12340000,
            'form_1040_line_25a' => 100000,
            'schedule_b_line_1' => 5000,
        ];
        $lines = [
            ['form' => '1040', 'line' => '1z', 'label' => 'Wages', 'amount_cents' => 12345600],
            ['form' => '1040', 'line' => '25a', 'amount_cents' => 100050],
            ['form' => 'Schedule D', 'line' => '5', 'amount_cents' => 777],
            ['form' => 'Form 9999', 'line' => '1', 'amount_cents' => 1],
        ];

        $result = $this->service()->compare(2024, $previewTotals, $lines, 100, 'cpa_prepared_1040');

        $this->assertSame(2024, $result['year']);
        $this->assertSame('cpa_prepared_1040', $result['return_type']);
        $this->assertSame(100, $result['tolerance_cents']);
        $this->assertSame([
            'matched' => 1,
            'different' => 1,
            'missing_in_preview' => 1,
            'missing_in_return' => 1,
            'unmatched_input' => 1,
        ], $result['summary']);

        $different = collect($result['discrepancies'])->firstWhere('key', 'form_1040_line_1z');
        $this->assertSame('different', $different['status']);
        $this->assertSame(12345600, $different['return_amount_cents']);
        $this->assertSame(12340000, $different['preview_amount_cents']);
        $this->assertSame(5600, $different['delta_cents']);
        $this->assertSame('review', $different['severity']);

        $missing = collect($result['discrepancies'])->firstWhere('key', 'schedule_d_line_5');
        $this->assertSame('missing_in_preview', $missing['status']);
        $this->assertNull($missing['preview_amount_cents']);
        $this->assertSame(777, $missing['delta_cents']);

        $this->assertSame([
            ['form' => 'Form 9999', 'line' => '1', 'label' => null],
        ], $result['unmatched_inputs']);
    }

    public function test_compare_counts_missing_in_return_without_dumping_preview_lines(): void
    {
        $previewTotals = [
            'form_1040_line_1z' => 100,
            'schedule_b_line_1' => 200,
            'schedule_b_line_5' => 0,
        ];

        $result = $this->service()->compare(2024, $previewTotals, [
            ['form' => '1040', 'line' => '1z', 'amount_cents' => 100],
        ]);

        $this->assertSame(1, $result['summary']['matched']);
        // schedule_b_line_1 is absent from the input; the zero-total
        // schedule_b_line_5 routing is not counted.
        $this->assertSame(1, $result['summary']['missing_in_return']);
        $this->assertSame([], $result['discrepancies']);
    }

    public function test_compare_default_tolerance_is_exact_and_negative_tolerance_is_clamped(): void
    {
        $previewTotals = ['form_1040_line_1z' => 100];
        $lines = [['form' => '1040', 'line' => '1z', 'amount_cents' => 101]];

        $exact = $this->service()->compare(2024, $previewTotals, $lines);
        $this->assertSame(1, $exact['summary']['different']);

        $clamped = $this->service()->compare(2024, $previewTotals, $lines, -50);
        $this->assertSame(0, $clamped['tolerance_cents']);
        $this->assertSame(1, $clamped['summary']['different']);
    }

    // -------------------------------------------------------------------
    // compareForUser
    // -------------------------------------------------------------------

    public function test_compare_for_user_builds_totals_from_dataset_tax_facts(): void
    {
        $dataService = $this->createMock(TaxPreviewDataService::class);
        $dataService->expects($this->once())
            ->method('datasetForYear')
            ->with(7, 2024, true)
            ->willReturn([
                'taxFacts' => [
                    'form1040' => [
                        'line1zSources' => [$this->sourceRow('w2-1', 'form_1040_line_1z', 123400.00)],
                    ],
                ],
            ]);

        $result = $this->service($dataService)->compareForUser(7, 2024, [
            ['form' => '1040', 'line' => '1z', 'amount_cents' => 12345600],
        ], 100, 'cpa_prepared_1040');

        $this->assertSame(1, $result['summary']['different']);
        $this->assertSame(5600, $result['discrepancies'][0]['delta_cents']);
    }

    public function test_compare_for_user_handles_missing_tax_facts_key(): void
    {
        $dataService = $this->createMock(TaxPreviewDataService::class);
        $dataService->method('datasetForYear')->willReturn([]);

        $result = $this->service($dataService)->compareForUser(7, 2024, [
            ['form' => '1040', 'line' => '1z', 'amount_cents' => 1],
        ]);

        $this->assertSame(1, $result['summary']['missing_in_preview']);
        $this->assertSame(0, $result['summary']['missing_in_return']);
    }
}
