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
        $this->assertStringContainsString('Taxpayer', $content);
        $this->assertStringContainsString('Example', $content);
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
        $this->assertStringContainsString('Taxpayer', $content);
        $this->assertStringContainsString('Example', $content);
        $this->assertStringNotContainsString('/AcroForm', $content);
    }

    public function test_editable_multi_form_packets_namespace_fields_by_form_instance(): void
    {
        $content = app(IrsAcroFormFillEngine::class)->fillForms([
            [
                'formId' => 'form-8949',
                'templatePath' => resource_path('irs/forms/2025/f8949.pdf'),
                'fieldValues' => [
                    'f1_01[0]' => 'First Packet Form',
                    'c1_1[0]' => '1',
                    'f1_03[0]' => 'First lot',
                ],
                'instanceKey' => 'return-4-0',
            ],
            [
                'formId' => 'form-8949',
                'templatePath' => resource_path('irs/forms/2025/f8949.pdf'),
                'fieldValues' => [
                    'f1_01[0]' => 'Second Packet Form',
                    'c1_1[0]' => '1',
                    'f1_03[0]' => 'Second lot',
                ],
                'instanceKey' => 'return-4-1',
            ],
        ], new TaxReturnPdfOptions(2025, 'return', 'editable', null, 'editable-packet.pdf'));

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(4, $this->pageCount($content));
        $this->assertStringContainsString('First Packet Form', $content);
        $this->assertStringContainsString('Second Packet Form', $content);
        $this->assertStringContainsString('/AcroForm', $content);
        $this->assertStringContainsString('trp_form_8949_return_4_0_', $content);
        $this->assertStringContainsString('trp_form_8949_return_4_1_', $content);

        preg_match_all('/\/T\s*\((trp_[^)]+)\)/', $content, $matches);

        $this->assertGreaterThan(300, count($matches[1]));
        $this->assertSame($matches[1], array_values(array_unique($matches[1])));
    }

    public function test_print_multi_form_packet_draws_static_values_without_acroform(): void
    {
        $content = app(IrsAcroFormFillEngine::class)->fillForms([
            [
                'formId' => 'form-1040',
                'templatePath' => resource_path('irs/forms/2025/f1040.pdf'),
                'fieldValues' => $this->fieldValues(),
                'instanceKey' => 'return-0',
            ],
            [
                'formId' => 'schedule-1',
                'templatePath' => resource_path('irs/forms/2025/f1040s1.pdf'),
                'fieldValues' => [
                    'f1_01[0]' => 'Taxpayer Example',
                    'f1_02[0]' => '123456789',
                    'f1_36[0]' => '42',
                    'f1_37[0]' => '42',
                    'f1_38[0]' => '42',
                ],
                'instanceKey' => 'return-1',
            ],
        ], new TaxReturnPdfOptions(2025, 'return', 'print', null, 'print-packet.pdf'));

        $this->assertStringStartsWith('%PDF', $content);
        $this->assertSame(4, $this->pageCount($content));
        $this->assertStringContainsString('Taxpayer', $content);
        $this->assertStringNotContainsString('/AcroForm', $content);
    }

    /**
     * @return array<string, string>
     */
    private function fieldValues(): array
    {
        return [
            'f1_14[0]' => 'Taxpayer',
            'f1_15[0]' => 'Example',
            'f1_16[0]' => '123456789',
            'f1_20[0]' => '1 Main St',
            'f1_22[0]' => 'Sampletown',
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
