<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class TaxPreviewExportController extends Controller
{
    public function export(Request $request): Response
    {
        $validated = $request->validate([
            'filename' => ['required', 'string', 'max:255'],
            'sheets' => ['required', 'array', 'min:1'],
            'sheets.*.name' => ['required', 'string', 'max:31'],
            'sheets.*.rows' => ['required', 'array'],
            'sheets.*.rows.*.line' => ['nullable', 'string'],
            'sheets.*.rows.*.description' => ['required', 'string'],
            'sheets.*.rows.*.amount' => ['nullable', 'numeric'],
            'sheets.*.rows.*.formula' => ['nullable', 'string'],
            'sheets.*.rows.*.note' => ['nullable', 'string'],
            'sheets.*.rows.*.isHeader' => ['nullable', 'boolean'],
            'sheets.*.rows.*.isTotal' => ['nullable', 'boolean'],
        ]);

        $spreadsheet = new Spreadsheet;
        $spreadsheet->removeSheetByIndex(0);

        foreach ($validated['sheets'] as $index => $sheetData) {
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

                if (array_key_exists('line', $rowData) && $rowData['line'] !== null) {
                    $sheet->setCellValueExplicit("A{$excelRow}", (string) $rowData['line'], DataType::TYPE_STRING);
                }
                $sheet->setCellValueExplicit("B{$excelRow}", $rowData['description'], DataType::TYPE_STRING);

                if (! empty($rowData['formula'])) {
                    $sheet->setCellValue("C{$excelRow}", $rowData['formula']);
                } elseif (array_key_exists('amount', $rowData) && $rowData['amount'] !== null) {
                    $sheet->setCellValue("C{$excelRow}", (float) $rowData['amount']);
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

            $sheet->getColumnDimension('A')->setAutoSize(true);
            $sheet->getColumnDimension('B')->setAutoSize(true);
            $sheet->getColumnDimension('C')->setAutoSize(true);
            $sheet->getColumnDimension('D')->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');
        $content = ob_get_clean();

        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', (string) $validated['filename']) ?: 'tax-preview.xlsx';
        if (! str_ends_with(strtolower($filename), '.xlsx')) {
            $filename .= '.xlsx';
        }

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
