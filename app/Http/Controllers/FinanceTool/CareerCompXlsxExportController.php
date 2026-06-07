<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Services\Finance\CareerCompWorkbookBuilder;
use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class CareerCompXlsxExportController extends Controller
{
    public function __construct(
        private readonly CareerCompCalculator $calculator,
        private readonly CareerCompWorkbookBuilder $workbookBuilder,
    ) {}

    public function export(Request $request): Response
    {
        $validated = $request->validate(array_merge(
            ComputeCareerCompRequest::inputRules(),
            ['filename' => ['nullable', 'string', 'max:255']],
        ));

        $projection = $this->calculator
            ->project(CareerCompInputs::fromArray($validated['inputs']))
            ->toArray();

        $workbook = $this->workbookBuilder->build($projection, $validated['filename'] ?? null);

        $spreadsheet = new Spreadsheet;
        $spreadsheet->removeSheetByIndex(0);

        foreach ($workbook['sheets'] as $index => $sheetData) {
            // Sanitize: strip Excel-invalid characters and enforce the 31-char limit.
            $tabName = preg_replace('/[\\\\\/\*\?\:\[\]]/', '', (string) $sheetData['name']);
            $tabName = trim(mb_substr($tabName, 0, 31)) ?: 'Sheet';
            $sheet = $spreadsheet->createSheet($index)->setTitle($tabName);

            if (is_array($sheetData['columns'] ?? null)) {
                $columns = array_values(array_filter($sheetData['columns'], 'is_string'));
                $lastColumn = $this->writeWideSheet($sheet, $columns, $sheetData['rows']);
            } else {
                $lastColumn = $this->writeDefaultSheet($sheet, $sheetData['rows']);
            }

            foreach (range(1, Coordinate::columnIndexFromString($lastColumn)) as $columnIndex) {
                $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($columnIndex))->setAutoSize(true);
            }
        }

        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');
        $content = ob_get_clean();

        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', (string) $workbook['filename']) ?: 'career-comparison.xlsx';
        if (! str_ends_with(strtolower($filename), '.xlsx')) {
            $filename .= '.xlsx';
        }

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function writeDefaultSheet(Worksheet $sheet, array $rows): string
    {
        $sheet->setCellValue('A1', 'Line');
        $sheet->setCellValue('B1', 'Description');
        $sheet->setCellValue('C1', 'Amount');
        $sheet->setCellValue('D1', 'Note');
        $sheet->getStyle('A1:D1')->getFont()->setBold(true);

        foreach ($rows as $rowIndex => $rowData) {
            $excelRow = $rowIndex + 2;

            if (array_key_exists('line', $rowData)) {
                $sheet->setCellValueExplicit("A{$excelRow}", (string) $rowData['line'], DataType::TYPE_STRING);
            }
            $sheet->setCellValueExplicit("B{$excelRow}", (string) ($rowData['description'] ?? ''), DataType::TYPE_STRING);

            if (array_key_exists('amount', $rowData)) {
                $sheet->setCellValue("C{$excelRow}", $rowData['amount']);
            }

            if (! empty($rowData['note'])) {
                $sheet->setCellValueExplicit("D{$excelRow}", (string) $rowData['note'], DataType::TYPE_STRING);
            }

            $this->styleDataRow($sheet, $rowData, $excelRow, 'D');
        }

        return 'D';
    }

    /**
     * @param  list<string>  $columns
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function writeWideSheet(Worksheet $sheet, array $columns, array $rows): string
    {
        foreach ($columns as $columnIndex => $heading) {
            $column = Coordinate::stringFromColumnIndex($columnIndex + 1);
            $sheet->setCellValueExplicit("{$column}1", $heading, DataType::TYPE_STRING);
        }

        $lastColumn = Coordinate::stringFromColumnIndex(max(1, count($columns)));
        $sheet->getStyle("A1:{$lastColumn}1")->getFont()->setBold(true);

        foreach ($rows as $rowIndex => $rowData) {
            $excelRow = $rowIndex + 2;

            if (array_key_exists('line', $rowData)) {
                $sheet->setCellValueExplicit("A{$excelRow}", (string) $rowData['line'], DataType::TYPE_STRING);
            }

            $values = is_array($rowData['values'] ?? null) ? array_values($rowData['values']) : [];
            foreach ($values as $valueIndex => $value) {
                if ($value === null) {
                    continue;
                }

                $column = Coordinate::stringFromColumnIndex($valueIndex + 2);
                if (is_numeric($value)) {
                    $sheet->setCellValue("{$column}{$excelRow}", (float) $value);
                } else {
                    $sheet->setCellValueExplicit("{$column}{$excelRow}", (string) $value, DataType::TYPE_STRING);
                }
            }

            $this->styleDataRow($sheet, $rowData, $excelRow, $lastColumn);
        }

        return $lastColumn;
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function styleDataRow(Worksheet $sheet, array $rowData, int $excelRow, string $lastColumn): void
    {
        if (! empty($rowData['isHeader'])) {
            $sheet->getStyle("A{$excelRow}:{$lastColumn}{$excelRow}")->getFont()->setBold(true);
        }

        if (! empty($rowData['isTotal'])) {
            $sheet->getStyle("A{$excelRow}:{$lastColumn}{$excelRow}")->getFont()->setBold(true);
            $sheet->getStyle("A{$excelRow}:{$lastColumn}{$excelRow}")->getBorders()->getTop()->setBorderStyle(Border::BORDER_THIN);
        }
    }
}
