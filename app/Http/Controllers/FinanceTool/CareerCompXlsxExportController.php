<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinancialPlanning\ComputeCareerCompRequest;
use App\Services\Finance\CareerCompWorkbookBuilder;
use App\Services\Planning\CareerComp\CareerCompCalculator;
use App\Services\Planning\CareerComp\CareerCompInputs;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
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
            $sheet->setCellValue('A1', 'Line');
            $sheet->setCellValue('B1', 'Description');
            $sheet->setCellValue('C1', 'Amount');
            $sheet->setCellValue('D1', 'Note');
            $sheet->getStyle('A1:D1')->getFont()->setBold(true);

            foreach ($sheetData['rows'] as $rowIndex => $rowData) {
                $excelRow = $rowIndex + 2;

                if (array_key_exists('line', $rowData)) {
                    $sheet->setCellValueExplicit("A{$excelRow}", $rowData['line'], DataType::TYPE_STRING);
                }
                $sheet->setCellValueExplicit("B{$excelRow}", $rowData['description'], DataType::TYPE_STRING);

                if (array_key_exists('amount', $rowData)) {
                    $sheet->setCellValue("C{$excelRow}", $rowData['amount']);
                }

                if (! empty($rowData['note'])) {
                    $sheet->setCellValueExplicit("D{$excelRow}", $rowData['note'], DataType::TYPE_STRING);
                }

                if (! empty($rowData['isHeader'])) {
                    $sheet->getStyle("A{$excelRow}:D{$excelRow}")->getFont()->setBold(true);
                }

                if (! empty($rowData['isTotal'])) {
                    $sheet->getStyle("A{$excelRow}:D{$excelRow}")->getFont()->setBold(true);
                    $sheet->getStyle("A{$excelRow}:D{$excelRow}")->getBorders()->getTop()->setBorderStyle(Border::BORDER_THIN);
                }
            }

            foreach (['A', 'B', 'C', 'D'] as $column) {
                $sheet->getColumnDimension($column)->setAutoSize(true);
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
}
