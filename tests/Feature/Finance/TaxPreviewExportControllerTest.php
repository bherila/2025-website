<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Style\Border;
use Tests\TestCase;

class TaxPreviewExportControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoint_requires_authentication(): void
    {
        $response = $this->postJson('/api/finance/tax-preview/export-xlsx', [
            'year' => 2025,
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_endpoint_returns_valid_xlsx(): void
    {
        $user = User::factory()->create();
        FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'w2',
            'original_filename' => 'w2.pdf',
            'stored_filename' => 'w2.pdf',
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => str_repeat('c', 64),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
            'parsed_data' => [
                'employer_name' => 'Wage Co',
                'box1_wages' => 100000,
                'box2_fed_tax' => 15000,
                'box3_social_security_wages' => 100000,
                'box5_medicare_wages' => 100000,
            ],
        ]);

        $payload = [
            'year' => 2025,
            'filename' => 'tax-preview-2025.xlsx',
        ];

        $response = $this->actingAs($user)->postJson('/api/finance/tax-preview/export-xlsx', $payload);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertNotEmpty($response->getContent());

        $tempPath = tempnam(sys_get_temp_dir(), 'tax-preview-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('Overview', $sheet->getTitle());
        $this->assertNull($sheet->getCell('A2')->getValue());
        $this->assertSame('Backend tax facts summary', $sheet->getCell('B2')->getValue());
        $this->assertNull($sheet->getCell('C2')->getValue());
        $this->assertSame('Form 1040 line 9 - total income', $sheet->getCell('B3')->getValue());
        $this->assertSame(100000.0, (float) $sheet->getCell('C3')->getCalculatedValue());
        $this->assertTrue($sheet->getStyle('B2')->getFont()->getBold());
        $this->assertTrue($sheet->getStyle('B7')->getFont()->getBold());
        $this->assertSame(Border::BORDER_THIN, $sheet->getStyle('B7')->getBorders()->getTop()->getBorderStyle());
        $this->assertNotNull($spreadsheet->getSheetByName('Form 1040'));
    }
}
