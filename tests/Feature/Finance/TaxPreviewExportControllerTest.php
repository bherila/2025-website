<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Symfony\Component\HttpFoundation\Response;
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

        $spreadsheet = $this->spreadsheetFromResponse($response);

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

    public function test_scoped_k1_grid_export_returns_only_matching_grid_sheet(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-preview/export-xlsx', [
            'year' => 2025,
            'filename' => 'k1-grid.xlsx',
            'scope' => 'k1-all-in-one',
            'grids' => [
                $this->comparisonGrid('K-1 All-in-One Comparison', 'k1-all-in-one'),
                $this->comparisonGrid('K-3 All-in-One Comparison', 'k3-all-in-one'),
            ],
        ]);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $spreadsheet = $this->spreadsheetFromResponse($response);
        $this->assertSame(1, $spreadsheet->getSheetCount());

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('K-1 All-in-One Comparison', $sheet->getTitle());
        $this->assertSame('B2', $sheet->getFreezePane());
        $this->assertSame('Label', $sheet->getCell('A1')->getValue());
        $this->assertSame('Source A', $sheet->getCell('B1')->getValue());
        $this->assertSame('Source B', $sheet->getCell('C1')->getValue());
        $this->assertSame('K-1 comparison', $sheet->getCell('A2')->getValue());
        $this->assertTrue($sheet->getStyle('A2')->getFont()->getBold());
        $this->assertSame('Line', $sheet->getCell('A4')->getValue());
        $this->assertSame('Current value', $sheet->getCell('B4')->getValue());
        $this->assertSame('Ordinary business income', $sheet->getCell('A5')->getValue());
        $this->assertSame(1234.56, (float) $sheet->getCell('B5')->getCalculatedValue());
        $this->assertNull($sheet->getCell('C5')->getValue());
        $this->assertSame(NumberFormat::FORMAT_CURRENCY_USD, $sheet->getStyle('B5')->getNumberFormat()->getFormatCode());
        $this->assertSame('Total ordinary income', $sheet->getCell('A6')->getValue());
        $this->assertTrue($sheet->getStyle('B6')->getFont()->getBold());
        $this->assertSame(Border::BORDER_THIN, $sheet->getStyle('B6')->getBorders()->getTop()->getBorderStyle());
        $this->assertNull($spreadsheet->getSheetByName('K-3 All-in-One Comparison'));
    }

    public function test_full_export_appends_supplied_normalized_grid_sheets(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/finance/tax-preview/export-xlsx', [
            'year' => 2025,
            'filename' => 'tax-preview-2025.xlsx',
            'grids' => [
                $this->comparisonGrid('K-1 All-in-One Comparison', 'k1-all-in-one'),
            ],
        ]);

        $response->assertOk();

        $spreadsheet = $this->spreadsheetFromResponse($response);
        $this->assertInstanceOf(Worksheet::class, $spreadsheet->getSheetByName('Overview'));

        $gridSheet = $spreadsheet->getSheetByName('K-1 All-in-One Comparison');
        $this->assertInstanceOf(Worksheet::class, $gridSheet);
        $this->assertSame('B2', $gridSheet->getFreezePane());
        $this->assertSame('Source A', $gridSheet->getCell('B1')->getValue());
        $this->assertSame(1234.56, (float) $gridSheet->getCell('B5')->getCalculatedValue());
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

    /**
     * @param  TestResponse<Response>  $response
     */
    private function spreadsheetFromResponse(TestResponse $response): Spreadsheet
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'tax-preview-test');
        file_put_contents($tempPath, $response->getContent());
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        return $spreadsheet;
    }

    /**
     * @return array<string, mixed>
     */
    private function comparisonGrid(string $name, string $scope): array
    {
        return [
            'name' => $name,
            'scope' => $scope,
            'columns' => [
                ['key' => 'source_a', 'label' => 'Source A', 'width' => 18],
                ['key' => 'source_b', 'label' => 'Source B'],
            ],
            'rows' => [
                ['kind' => 'title', 'label' => str_starts_with($name, 'K-3') ? 'K-3 comparison' : 'K-1 comparison'],
                ['kind' => 'section', 'label' => 'Box 1'],
                ['kind' => 'header', 'label' => 'Line', 'cells' => ['source_a' => 'Current value', 'source_b' => 'Prior value']],
                ['kind' => 'data', 'label' => 'Ordinary business income', 'cells' => ['source_a' => 1234.56, 'source_b' => null]],
                ['kind' => 'total', 'label' => 'Total ordinary income', 'cells' => ['source_a' => 1234.56, 'source_b' => 100]],
            ],
        ];
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
