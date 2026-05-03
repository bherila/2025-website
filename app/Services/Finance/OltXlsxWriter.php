<?php

namespace App\Services\Finance;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class OltXlsxWriter
{
    private const HEADERS = [
        'Description of capital asset',
        'Date acquired ',
        'Date sold ',
        'Proceeds or Sales Price ($)',
        'Cost or other basis ($)',
        'Code(s) ',
        'Adjustments to gain or loss ($)',
        'Accrued market discount ($)',
        'Wash sale loss disallowed ($)',
        'Long Term/Short Term/Ordinary ',
        'Collectibles/QOF ',
        'Federal Income Tax Withheld ($)',
        'Noncovered Security',
        'Reported to IRS',
        'Loss not allowed based on amount in 1d /1f',
        'Basis Reported to IRS ',
        'Bartering ',
        'Applicable Checkbox on Form 8949',
        'Whose Capital Assets ',
        'Payer Name',
        'Payer TIN',
        'Foreign Address? ',
        'Payer Address line 1',
        'Payer Address line 2',
        'Payer City',
        'Payer State',
        'Payer Zip',
        'Payer Country Code',
        'Form Type ',
    ];

    /**
     * @param  Form8949ExportLot[]  $lots
     */
    public function write(array $lots): string
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('OLT Template');

        foreach (self::HEADERS as $index => $header) {
            $sheet->setCellValueExplicit([$index + 1, 1], $header, DataType::TYPE_STRING);
        }
        $sheet->getStyle('A1:AC1')->getFont()->setBold(true);

        foreach ($lots as $index => $lot) {
            $row = $index + 2;
            $values = [
                $lot->description,
                $this->formatDate($lot->dateAcquired),
                $this->formatDate($lot->dateSold),
                $lot->proceeds,
                $lot->costBasis,
                $lot->adjustmentCode ?? '',
                $lot->adjustmentAmount,
                $lot->accruedMarketDiscount ?? 0.0,
                $lot->washSaleDisallowed ?? 0.0,
                $lot->isShortTerm ? 'Short' : 'Long',
                '',
                $lot->federalIncomeTaxWithheld ?? '',
                $lot->isCovered === false ? 'Yes' : 'No',
                'GROSS PROCEEDS',
                '',
                $lot->isCovered === true ? 'Yes' : 'No',
                '',
                $lot->form8949Box,
                '',
                $lot->payerName ?? '',
                $lot->payerTin ?? '',
                'No',
                '',
                '',
                '',
                '',
                '',
                '',
                '1099-B',
            ];

            foreach ($values as $column => $value) {
                $sheet->setCellValue([$column + 1, $row], $value);
            }
        }

        for ($column = 1; $column <= count(self::HEADERS); $column++) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($column))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');

        return (string) ob_get_clean();
    }

    private function formatDate(?string $date): string
    {
        if ($date === null || trim($date) === '') {
            return 'various';
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1) {
            return (string) date('m/d/Y', strtotime($date));
        }

        return $date;
    }
}
