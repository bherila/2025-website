<?php

namespace App\Services\Finance;

class TxfWriter
{
    private const BOX_REFS = [
        'A' => '321',
        'B' => '711',
        'C' => '712',
        'D' => '323',
        'E' => '713',
        'F' => '714',
    ];

    /**
     * @param  Form8949ExportLot[]  $lots
     */
    public function write(array $lots): string
    {
        $lines = [
            'V042',
            'ABWH Finance',
            'D'.date('m/d/Y'),
            '^',
        ];

        foreach ($lots as $lot) {
            $lines[] = 'TD';
            $lines[] = 'N'.$this->referenceNumber($lot);
            $lines[] = 'C1';
            $lines[] = 'L1';
            $lines[] = 'P'.$lot->description;
            $lines[] = 'D'.$this->formatDate($lot->dateAcquired);
            $lines[] = 'D'.$this->formatDate($lot->dateSold);
            $lines[] = '$'.$this->formatAmount($lot->proceeds);
            $lines[] = '$'.$this->formatAmount($lot->costBasis);

            if ($lot->adjustmentAmount !== 0.0) {
                $lines[] = '$'.$this->formatAmount($lot->adjustmentAmount);
            }

            $lines[] = '^';
        }

        return implode("\r\n", $lines)."\r\n";
    }

    private function referenceNumber(Form8949ExportLot $lot): string
    {
        return self::BOX_REFS[$lot->form8949Box] ?? ($lot->isShortTerm ? '321' : '323');
    }

    private function formatDate(?string $date): string
    {
        if ($date === null || trim($date) === '') {
            return 'Various';
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1) {
            return (string) date('m/d/Y', strtotime($date));
        }

        return $date;
    }

    private function formatAmount(float $amount): string
    {
        return number_format($amount, 2, '.', '');
    }
}
