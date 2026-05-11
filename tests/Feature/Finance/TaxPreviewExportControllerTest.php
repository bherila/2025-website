<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
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
        $this->createReviewedTaxDocument(
            user: $user,
            formType: 'w2',
            filename: 'w2.pdf',
            parsedData: [
                'employer_name' => 'Wage Co',
                'box1_wages' => 100000,
                'box2_fed_tax' => 15000,
                'box3_social_security_wages' => 100000,
                'box5_medicare_wages' => 100000,
            ],
        );
        $this->createReviewedTaxDocument(
            user: $user,
            formType: '1099_misc',
            filename: 'misc-one.pdf',
            parsedData: [
                'payer_name' => 'Misc One',
                'box3_other_income' => 250,
            ],
        );
        $this->createReviewedTaxDocument(
            user: $user,
            formType: '1099_misc',
            filename: 'misc-two.pdf',
            parsedData: [
                'payer_name' => 'Misc Two',
                'box3_other_income' => 75,
            ],
        );

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
        $this->assertSame(100325.0, (float) $sheet->getCell('C3')->getCalculatedValue());
        $this->assertTrue($sheet->getStyle('B2')->getFont()->getBold());
        $totalTaxRow = $this->rowNumberContaining($sheet, 'B', 'Form 1040 line 24 - total tax');
        $this->assertTrue($sheet->getStyle("B{$totalTaxRow}")->getFont()->getBold());
        $this->assertSame(Border::BORDER_THIN, $sheet->getStyle("B{$totalTaxRow}")->getBorders()->getTop()->getBorderStyle());

        $form1040Sheet = $spreadsheet->getSheetByName('Form 1040');
        $this->assertInstanceOf(Worksheet::class, $form1040Sheet);

        $form8995Sheet = $spreadsheet->getSheetByName('Form 8995');
        $this->assertInstanceOf(Worksheet::class, $form8995Sheet);
        $taxableIncomeBeforeQbiRow = $this->rowNumberContaining($form8995Sheet, 'B', 'Taxable Income Before Qbi');
        $this->assertFalse($form8995Sheet->getStyle("B{$taxableIncomeBeforeQbiRow}")->getFont()->getBold());
        $this->assertSame(Border::BORDER_NONE, $form8995Sheet->getStyle("B{$taxableIncomeBeforeQbiRow}")->getBorders()->getTop()->getBorderStyle());

        $schedule1Sheet = $spreadsheet->getSheetByName('Schedule 1');
        $this->assertInstanceOf(Worksheet::class, $schedule1Sheet);
        $line8zSourcesHeaderRow = $this->rowNumberContaining($schedule1Sheet, 'B', 'Line8z Sources');
        $miscOneRow = $this->rowNumberContainingAfter($schedule1Sheet, 'B', 'Misc One', $line8zSourcesHeaderRow);
        $miscTwoRow = $this->rowNumberContainingAfter($schedule1Sheet, 'B', 'Misc Two', $line8zSourcesHeaderRow);

        $this->assertSame('8z', $schedule1Sheet->getCell("A{$miscOneRow}")->getValue());
        $this->assertSame(250.0, (float) $schedule1Sheet->getCell("C{$miscOneRow}")->getCalculatedValue());
        $this->assertSame('8z', $schedule1Sheet->getCell("A{$miscTwoRow}")->getValue());
        $this->assertSame(75.0, (float) $schedule1Sheet->getCell("C{$miscTwoRow}")->getCalculatedValue());
        $this->assertLessThan($miscOneRow, $line8zSourcesHeaderRow);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function createReviewedTaxDocument(User $user, string $formType, string $filename, array $parsedData): FileForTaxDocument
    {
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => $formType,
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => '',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => hash('sha256', "{$user->id}-{$filename}"),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
            'parsed_data' => $parsedData,
        ]);
    }

    private function rowNumberContaining(Worksheet $sheet, string $column, string $needle): int
    {
        return $this->rowNumberContainingAfter($sheet, $column, $needle, 0);
    }

    private function rowNumberContainingAfter(Worksheet $sheet, string $column, string $needle, int $startRow): int
    {
        for ($row = $startRow + 1; $row <= $sheet->getHighestRow(); $row++) {
            $value = $sheet->getCell("{$column}{$row}")->getValue();

            if (is_scalar($value) && str_contains((string) $value, $needle)) {
                return $row;
            }
        }

        $this->fail("Expected {$sheet->getTitle()} column {$column} to contain {$needle}.");
    }
}
