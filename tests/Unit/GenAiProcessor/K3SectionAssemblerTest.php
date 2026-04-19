<?php

namespace Tests\Unit\GenAiProcessor;

use App\GenAiProcessor\Services\K3SectionAssembler;
use PHPUnit\Framework\TestCase;

class K3SectionAssemblerTest extends TestCase
{
    private K3SectionAssembler $assembler;

    protected function setUp(): void
    {
        $this->assembler = new K3SectionAssembler;
    }

    public function test_empty_args_returns_no_sections(): void
    {
        $result = $this->assembler->assemble([]);
        $this->assertSame([], $result);
    }

    public function test_part1_checkboxes_produces_section(): void
    {
        $result = $this->assembler->assemble([
            'k3_part1_checkboxes' => ['box_a' => true, 'box_b' => false],
        ]);

        $this->assertCount(1, $result);
        $this->assertSame('part1', $result[0]['sectionId']);
        $this->assertSame(['box_a' => true, 'box_b' => false], $result[0]['data']['checkboxes']);
    }

    public function test_part2_rows_split_income_and_deduction_sections(): void
    {
        $result = $this->assembler->assemble([
            'k3_part2_rows' => [
                ['line' => '6', 'col_c_passive' => 1000],   // income
                ['line' => '15', 'col_c_passive' => 500],   // income
                ['line' => '39', 'col_g_total' => 200],     // deduction
                ['line' => '55', 'col_g_total' => 100],     // deduction (net line)
            ],
        ]);

        $ids = array_column($result, 'sectionId');
        $this->assertContains('part2_section1', $ids);
        $this->assertContains('part2_section2', $ids);

        $sec1 = $result[array_search('part2_section1', $ids)];
        $this->assertCount(2, $sec1['data']['rows']);

        $sec2 = $result[array_search('part2_section2', $ids)];
        $this->assertCount(2, $sec2['data']['rows']);
    }

    public function test_part2_income_only_omits_section2(): void
    {
        $result = $this->assembler->assemble([
            'k3_part2_rows' => [
                ['line' => '6', 'col_c_passive' => 1000],
            ],
        ]);

        $ids = array_column($result, 'sectionId');
        $this->assertContains('part2_section1', $ids);
        $this->assertNotContains('part2_section2', $ids);
    }

    public function test_foreign_taxes_computes_grand_total(): void
    {
        $result = $this->assembler->assemble([
            'k3_part3_foreign_taxes' => [
                ['country' => 'DE', 'amount_usd' => 1500.0],
                ['country' => 'FR', 'amount_usd' => 800.0],
                ['country' => 'XX', 'amount_usd' => 'not-a-number'],  // should be excluded from total
            ],
        ]);

        $sec = $this->findSection($result, 'part3_section4');
        $this->assertNotNull($sec);
        $this->assertSame(2300.0, $sec['data']['grandTotalUSD']);
        $this->assertCount(3, $sec['data']['countries']);
    }

    public function test_sec743b_positive_only(): void
    {
        $result = $this->assembler->assemble([
            'k3_part3_section5_sec743b_positive' => 12000,
        ]);

        $sec = $this->findSection($result, 'part3_section5');
        $this->assertNotNull($sec);
        $this->assertSame(12000.0, $sec['data']['sec743b_positive']);
        $this->assertArrayNotHasKey('sec743b_negative', $sec['data']);
    }

    public function test_part4_fdii_skips_non_numeric_fields(): void
    {
        $result = $this->assembler->assemble([
            'k3_part4_net_income_loss' => 50000,
            'k3_part4_dei_gross_receipts' => 'n/a',  // non-numeric — should be skipped
        ]);

        $sec = $this->findSection($result, 'part4');
        $this->assertNotNull($sec);
        $this->assertSame(50000.0, $sec['data']['net_income_loss']);
        $this->assertArrayNotHasKey('dei_gross_receipts', $sec['data']);
    }

    public function test_part9_notes_with_numeric_fields(): void
    {
        $result = $this->assembler->assemble([
            'k3_part9_notes' => 'Some tax-exempt income details',
            'k3_part9_line1_gross_receipts' => 99000,
            'k3_part9_line5_denominator_amounts' => 12000,
        ]);

        $sec = $this->findSection($result, 'part9');
        $this->assertNotNull($sec);
        $this->assertSame('Some tax-exempt income details', $sec['notes']);
        $this->assertSame(99000.0, $sec['data']['line1_gross_receipts']);
        $this->assertSame(12000.0, $sec['data']['line5_denominator_amounts']);
    }

    public function test_part9_numeric_data_without_notes_still_produces_section(): void
    {
        $result = $this->assembler->assemble([
            'k3_part9_line1_gross_receipts' => 5000,
        ]);

        $sec = $this->findSection($result, 'part9');
        $this->assertNotNull($sec);
        $this->assertSame(5000.0, $sec['data']['line1_gross_receipts']);
    }

    public function test_note_only_parts_omitted_when_empty(): void
    {
        // Parts V–VIII and X–XIII should not appear when no notes provided
        $result = $this->assembler->assemble([]);
        $noteOnlyParts = ['part5', 'part6', 'part7', 'part8', 'part10', 'part11', 'part12', 'part13'];

        foreach ($noteOnlyParts as $partId) {
            $this->assertNull($this->findSection($result, $partId), "Expected $partId to be absent");
        }
    }

    public function test_legacy_k3_sections_merged_when_no_conflict(): void
    {
        $result = $this->assembler->assemble([
            'k3_sections' => [
                ['sectionId' => 'legacy_section', 'title' => 'Legacy', 'data' => ['foo' => 'bar'], 'notes' => ''],
            ],
        ]);

        $sec = $this->findSection($result, 'legacy_section');
        $this->assertNotNull($sec);
        $this->assertSame(['foo' => 'bar'], $sec['data']);
    }

    public function test_legacy_k3_sections_skipped_when_id_already_present(): void
    {
        $result = $this->assembler->assemble([
            'k3_part3_asset_rows' => [['line' => '6a', 'col_g_total' => 1000000]],
            'k3_sections' => [
                // same sectionId as above — should be ignored
                ['sectionId' => 'part3_section2', 'title' => 'Old version', 'data' => [], 'notes' => ''],
            ],
        ]);

        $all = array_filter($result, fn ($s) => $s['sectionId'] === 'part3_section2');
        $this->assertCount(1, $all);
        $this->assertSame('Part III – Section 2: Interest Expense Apportionment Factors', array_values($all)[0]['title']);
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    /** @param list<array{sectionId: string, title: string, data: mixed, notes: string}> $sections */
    private function findSection(array $sections, string $id): ?array
    {
        foreach ($sections as $sec) {
            if ($sec['sectionId'] === $id) {
                return $sec;
            }
        }

        return null;
    }
}
