<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\IrsAcroFormFillEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Smalot\PdfParser\Parser;
use Tests\TestCase;

class TcpdfFpdiFormEngineTest extends TestCase
{
    use RefreshDatabase;

    public function test_editable_output_rehydrates_unique_fillable_fields_and_prefills_values(): void
    {
        $content = app(IrsAcroFormFillEngine::class)->fill(
            resource_path('irs/forms/2025/f1040.pdf'),
            $this->fieldValues(),
            new TaxReturnPdfOptions(2025, 'form', 'editable', 'form-1040', 'editable.pdf'),
        );

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(2, $this->pageCount($content));
        $this->assertStringContainsString('Ada', $content);
        $this->assertStringContainsString('Lovelace', $content);
        $this->assertStringContainsString('/AcroForm', $content);

        preg_match_all('/\/T\s*\((trp_[^)]+)\)/', $content, $matches);

        $this->assertGreaterThan(150, count($matches[1]));
        $this->assertSame($matches[1], array_values(array_unique($matches[1])));
    }

    public function test_print_output_draws_static_values_without_acroform(): void
    {
        $content = app(IrsAcroFormFillEngine::class)->fill(
            resource_path('irs/forms/2025/f1040.pdf'),
            $this->fieldValues(),
            new TaxReturnPdfOptions(2025, 'form', 'print', 'form-1040', 'print.pdf'),
        );

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(2, $this->pageCount($content));
        $this->assertStringContainsString('Ada', $content);
        $this->assertStringContainsString('Lovelace', $content);
        $this->assertStringNotContainsString('/AcroForm', $content);
    }

    /**
     * @return array<string, string>
     */
    private function fieldValues(): array
    {
        return [
            'f1_14[0]' => 'Ada',
            'f1_15[0]' => 'Lovelace',
            'f1_16[0]' => '123456789',
            'f1_20[0]' => '1 Main St',
            'f1_22[0]' => 'London',
            'f1_23[0]' => 'CA',
            'f1_24[0]' => '94105',
            'c1_8[0]' => '1',
            'c1_10[1]' => '2',
            'f1_55[0]' => '12345',
        ];
    }

    private function pageCount(string $content): int
    {
        return count((new Parser)->parseContent($content)->getPages());
    }
}
