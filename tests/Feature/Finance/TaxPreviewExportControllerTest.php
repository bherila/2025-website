<?php

namespace Tests\Feature\Finance;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Style\Border;
use Tests\TestCase;

class TaxPreviewExportControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoint_is_public_and_returns_valid_xlsx(): void
    {
        $payload = [
            'filename' => 'tax-preview-2025.xlsx',
            'sheets' => [
                [
                    'name' => 'Form 1040',
                    'rows' => [
                        ['description' => 'Part I — Income', 'isHeader' => true],
                        ['line' => '1a', 'description' => 'Wages', 'amount' => 100000],
                        ['line' => '9', 'description' => 'Total income', 'amount' => 100000, 'isTotal' => true],
                    ],
                ],
            ],
        ];

        $response = $this->postJson('/api/finance/tax-preview/export-xlsx', $payload);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertNotEmpty($response->getContent());

        $tempPath = tempnam(sys_get_temp_dir(), 'tax-preview-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('Wages', $sheet->getCell('B3')->getValue());
        $this->assertSame(100000.0, (float) $sheet->getCell('C3')->getCalculatedValue());
        $this->assertTrue($sheet->getStyle('B2')->getFont()->getBold());
        $this->assertTrue($sheet->getStyle('B4')->getFont()->getBold());
        $this->assertSame(Border::BORDER_THIN, $sheet->getStyle('B4')->getBorders()->getTop()->getBorderStyle());
    }
}
