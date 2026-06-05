<?php

namespace App\Services\Finance;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class TaxPreviewXlsxWriter
{
    private const string GRID_FORMAT_CURRENCY = 'currency';

    private const string GRID_FORMAT_NUMBER = 'number';

    private const string GRID_FORMAT_PERCENT = 'percent';

    private const string GRID_FORMAT_TEXT = 'text';

    /**
     * @param  array<int, array{name: string, rows: array<int, array<string, mixed>>}>  $factSheets
     * @param  array<int, array<string, mixed>>  $gridSheets
     */
    public function write(array $factSheets, array $gridSheets): string
    {
        $spreadsheet = new Spreadsheet;
        $spreadsheet->removeSheetByIndex(0);

        $usedTitles = [];
        $sheetIndex = 0;

        foreach ($factSheets as $sheetData) {
            $this->appendFactSheet($spreadsheet, $sheetData, $sheetIndex, $usedTitles);
            $sheetIndex++;
        }

        foreach ($gridSheets as $gridSheet) {
            $this->appendGridSheet($spreadsheet, $gridSheet, $sheetIndex, $usedTitles);
            $sheetIndex++;
        }

        if ($sheetIndex === 0) {
            $sheet = $spreadsheet->createSheet(0);
            $sheet->setTitle('Export');
            $sheet->setCellValueExplicit('A1', 'No exportable rows were provided.', DataType::TYPE_STRING);
        }

        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');

        return (string) ob_get_clean();
    }

    /**
     * @param  array{name: string, rows: array<int, array<string, mixed>>}  $sheetData
     * @param  array<string, true>  $usedTitles
     */
    private function appendFactSheet(Spreadsheet $spreadsheet, array $sheetData, int $sheetIndex, array &$usedTitles): void
    {
        $sheet = $spreadsheet->createSheet($sheetIndex);
        $sheet->setTitle($this->uniqueSheetTitle($sheetData['name'], $usedTitles));
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

            $sheet->setCellValueExplicit("B{$excelRow}", (string) $rowData['description'], DataType::TYPE_STRING);

            if (! empty($rowData['formula'])) {
                $sheet->setCellValue("C{$excelRow}", $rowData['formula']);
            } elseif (array_key_exists('amount', $rowData) && $rowData['amount'] !== null) {
                $sheet->setCellValue("C{$excelRow}", (float) $rowData['amount']);
            }

            if (! empty($rowData['note'])) {
                $sheet->setCellValueExplicit("D{$excelRow}", (string) $rowData['note'], DataType::TYPE_STRING);
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

    /**
     * @param  array<string, mixed>  $gridSheet
     * @param  array<string, true>  $usedTitles
     */
    private function appendGridSheet(Spreadsheet $spreadsheet, array $gridSheet, int $sheetIndex, array &$usedTitles): void
    {
        $columns = $this->gridColumns($gridSheet);
        $lastColumnIndex = count($columns) + 1;
        $lastColumn = Coordinate::stringFromColumnIndex($lastColumnIndex);

        $sheet = $spreadsheet->createSheet($sheetIndex);
        $sheet->setTitle($this->uniqueSheetTitle((string) ($gridSheet['name'] ?? 'Grid'), $usedTitles));
        $sheet->setCellValueExplicit('A1', 'Label', DataType::TYPE_STRING);

        foreach ($columns as $index => $column) {
            $sheet->setCellValueExplicit([$index + 2, 1], $column['label'], DataType::TYPE_STRING);
        }

        $sheet->freezePane('B2');
        $this->styleGeneratedGridHeader($sheet, $lastColumn);

        $rows = $this->gridRows($gridSheet);
        foreach ($rows as $rowIndex => $rowData) {
            $excelRow = $rowIndex + 2;
            $kind = (string) $rowData['kind'];
            $label = $this->gridRowLabel($rowData);
            $sheet->setCellValueExplicit([1, $excelRow], $label, DataType::TYPE_STRING);

            foreach ($columns as $columnIndex => $column) {
                $value = $this->gridCellValue($rowData, $column['key']);
                if ($value === null) {
                    continue;
                }

                $cellCoordinate = [$columnIndex + 2, $excelRow];
                if (is_int($value) || is_float($value)) {
                    if ($column['format'] === self::GRID_FORMAT_TEXT) {
                        $sheet->setCellValueExplicit($cellCoordinate, (string) $value, DataType::TYPE_STRING);

                        continue;
                    }

                    $sheet->setCellValue($cellCoordinate, $value);
                    $sheet->getStyle($cellCoordinate)->getNumberFormat()->setFormatCode($this->gridNumberFormatCode($column['format']));

                    continue;
                }

                $sheet->setCellValueExplicit($cellCoordinate, $value, DataType::TYPE_STRING);
            }

            if (in_array($kind, ['title', 'section'], true) && ! $this->gridRowHasCells($rowData)) {
                $sheet->mergeCells("A{$excelRow}:{$lastColumn}{$excelRow}");
            }

            $this->styleGridRow($sheet, $kind, $excelRow, $lastColumn);
        }

        $this->applyGridColumnWidths($sheet, $columns);
    }

    private function styleGeneratedGridHeader(Worksheet $sheet, string $lastColumn): void
    {
        $range = "A1:{$lastColumn}1";
        $sheet->getStyle($range)->getFont()->setBold(true);
        $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFE5E7EB');
        $sheet->getStyle($range)->getBorders()->getBottom()->setBorderStyle(Border::BORDER_THIN);
    }

    private function styleGridRow(Worksheet $sheet, string $kind, int $row, string $lastColumn): void
    {
        $range = "A{$row}:{$lastColumn}{$row}";

        if ($kind === 'title') {
            $sheet->getStyle($range)->getFont()->setBold(true)->setSize(14);
            $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFD1D5DB');

            return;
        }

        if ($kind === 'section') {
            $sheet->getStyle($range)->getFont()->setBold(true);
            $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFF3F4F6');

            return;
        }

        if ($kind === 'header') {
            $sheet->getStyle($range)->getFont()->setBold(true);
            $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFE5E7EB');
            $sheet->getStyle($range)->getBorders()->getBottom()->setBorderStyle(Border::BORDER_THIN);

            return;
        }

        if ($kind === 'total') {
            $sheet->getStyle($range)->getFont()->setBold(true);
            $sheet->getStyle($range)->getBorders()->getTop()->setBorderStyle(Border::BORDER_THIN);
        }
    }

    /**
     * @param  array<string, mixed>  $gridSheet
     * @return array<int, array{key: string, label: string, width: float|null, format: string}>
     */
    private function gridColumns(array $gridSheet): array
    {
        $columns = [];
        $rawColumns = $gridSheet['columns'] ?? [];

        if (! is_array($rawColumns)) {
            return $columns;
        }

        foreach ($rawColumns as $column) {
            if (! is_array($column)) {
                continue;
            }

            $columns[] = [
                'key' => (string) ($column['key'] ?? ''),
                'label' => (string) ($column['label'] ?? ''),
                'width' => isset($column['width']) && is_numeric($column['width']) ? (float) $column['width'] : null,
                'format' => $this->gridColumnFormat($column['format'] ?? null),
            ];
        }

        return $columns;
    }

    private function gridColumnFormat(mixed $format): string
    {
        if (! is_string($format)) {
            return self::GRID_FORMAT_CURRENCY;
        }

        return match ($format) {
            self::GRID_FORMAT_NUMBER,
            self::GRID_FORMAT_PERCENT,
            self::GRID_FORMAT_TEXT => $format,
            default => self::GRID_FORMAT_CURRENCY,
        };
    }

    private function gridNumberFormatCode(string $format): string
    {
        return match ($format) {
            self::GRID_FORMAT_NUMBER => NumberFormat::FORMAT_NUMBER_COMMA_SEPARATED1,
            self::GRID_FORMAT_PERCENT => NumberFormat::FORMAT_PERCENTAGE_00,
            default => NumberFormat::FORMAT_CURRENCY_USD,
        };
    }

    /**
     * @param  array<string, mixed>  $gridSheet
     * @return array<int, array<string, mixed>>
     */
    private function gridRows(array $gridSheet): array
    {
        $rows = $gridSheet['rows'] ?? [];

        return is_array($rows) ? array_values(array_filter($rows, is_array(...))) : [];
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function gridRowLabel(array $rowData): string
    {
        $label = $rowData['label'] ?? '';

        return is_scalar($label) ? (string) $label : '';
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function gridCellValue(array $rowData, string $key): string|int|float|null
    {
        $cells = $rowData['cells'] ?? [];
        if (! is_array($cells) || ! array_key_exists($key, $cells)) {
            return null;
        }

        $value = $cells[$key];
        if ($value === null || is_string($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function gridRowHasCells(array $rowData): bool
    {
        $cells = $rowData['cells'] ?? [];
        if (! is_array($cells)) {
            return false;
        }

        foreach ($cells as $value) {
            if ($value !== null) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, array{key: string, label: string, width: float|null, format: string}>  $columns
     */
    private function applyGridColumnWidths(Worksheet $sheet, array $columns): void
    {
        $sheet->getColumnDimension('A')->setWidth(32);

        foreach ($columns as $index => $column) {
            $width = $column['width'] ?? $this->defaultGridColumnWidth($column['label']);
            $width = max(6, min(80, $width));
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($index + 2))->setWidth($width);
        }
    }

    private function defaultGridColumnWidth(string $label): float
    {
        return (float) max(12, min(32, mb_strlen($label) + 2));
    }

    /**
     * @param  array<string, true>  $usedTitles
     */
    private function uniqueSheetTitle(string $title, array &$usedTitles): string
    {
        $baseTitle = $this->sanitizeSheetTitle($title);
        $sheetTitle = $baseTitle;
        $suffix = 2;

        while (array_key_exists(mb_strtolower($sheetTitle), $usedTitles)) {
            $suffixText = " {$suffix}";
            $sheetTitle = mb_substr($baseTitle, 0, 31 - mb_strlen($suffixText)).$suffixText;
            $suffix++;
        }

        $usedTitles[mb_strtolower($sheetTitle)] = true;

        return $sheetTitle;
    }

    private function sanitizeSheetTitle(string $title): string
    {
        $title = preg_replace('/[\\\\\/\*\?\:\[\]]/', '', $title) ?? '';
        $title = trim($title, " \t\n\r\0\x0B'");
        $title = trim(mb_substr($title, 0, 31));

        return $title !== '' ? $title : 'Sheet';
    }
}
