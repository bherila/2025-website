<?php

namespace App\Services\Finance;

use App\Services\Finance\Exceptions\WealthfrontPdfParseException;
use Smalot\PdfParser\Parser;
use Throwable;

class Wealthfront1099BLotParser
{
    private const MAX_PDF_BYTES = 25_000_000;

    public function textFromPdf(string $path): string
    {
        $realPath = realpath($path);
        if ($realPath === false || ! is_file($realPath) || ! is_readable($realPath)) {
            throw WealthfrontPdfParseException::invalidPath($path);
        }

        $fileSize = filesize($realPath);
        if ($fileSize === false) {
            throw WealthfrontPdfParseException::invalidPath($path);
        }

        if ($fileSize > self::MAX_PDF_BYTES) {
            throw WealthfrontPdfParseException::tooLarge($realPath, $fileSize, self::MAX_PDF_BYTES);
        }

        try {
            return (new Parser)->parseFile($realPath)->getText();
        } catch (Throwable $exception) {
            throw WealthfrontPdfParseException::parseFailed($realPath, $exception->getMessage());
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function parse(string $text): array
    {
        $lots = [];
        $isInCoveredSection = false;
        $isShortTerm = true;
        $description = '';
        $cusip = '';
        $symbol = '';

        foreach ($this->normalizedLines($text) as $line) {
            if (stripos($line, 'SHORT TERM TRANSACTIONS FOR COVERED TAX LOTS') !== false) {
                $isInCoveredSection = true;
                $isShortTerm = true;

                continue;
            }

            if (stripos($line, 'LONG TERM TRANSACTIONS FOR COVERED TAX LOTS') !== false) {
                $isInCoveredSection = true;
                $isShortTerm = false;

                continue;
            }

            if (stripos($line, 'UNDETERMINED TERM TRANSACTIONS') !== false || stripos($line, 'Detail for Dividends') !== false) {
                $isInCoveredSection = false;

                continue;
            }

            if (! $isInCoveredSection) {
                continue;
            }

            if (preg_match('/^\s*(.+?)\s*\/\s*CUSIP:\s*([A-Z0-9]+)\s*\/\s*Symbol:\s*(.*)$/i', $line, $matches) === 1) {
                $description = trim(preg_replace("/\\s*\\(cont'd\\)\\s*$/i", '', $matches[1]) ?? $matches[1]);
                $cusip = strtoupper(trim($matches[2]));
                $symbol = strtoupper(trim($matches[3]));
                if ($symbol === '' || str_starts_with($symbol, '(')) {
                    $symbol = $cusip;
                }

                continue;
            }

            $lot = $this->parseLotLine($line, $description, $cusip, $symbol, $isShortTerm);
            if ($lot !== null) {
                $lots[] = $lot;
            }
        }

        return $lots;
    }

    /**
     * @return string[]
     */
    private function normalizedLines(string $text): array
    {
        $text = preg_replace('/V\s*a\s*r\s*i\s*o\s*u\s*s/i', 'Various', $text) ?? $text;
        $rawLines = preg_split('/\R/', $text) ?: [];
        $lines = [];

        for ($index = 0; $index < count($rawLines); $index++) {
            $line = (string) $rawLines[$index];

            if (preg_match('/^\s*\d{2}\/\d{2}\/\d{2}\s+[\d,.]+\s+[\d,.]+\s*$/', $line) === 1) {
                $line = trim($line).' '.trim((string) ($rawLines[$index + 1] ?? '')).' '.trim((string) ($rawLines[$index + 2] ?? ''));
                $index += 2;
            }

            $lines[] = $line;
        }

        return $lines;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseLotLine(string $line, string $description, string $cusip, string $symbol, bool $isShortTerm): ?array
    {
        if ($description === '' || $cusip === '') {
            return null;
        }

        $pattern = '/^\s*'
            .'(?<sale_date>\d{2}\/\d{2}\/\d{2})\s+'
            .'(?<quantity>[\d,.]+)\s+'
            .'(?<proceeds>[\d,.]+)\s+'
            .'(?<purchase_date>Various|\d{2}\/\d{2}\/\d{2})\s+'
            .'(?<cost_basis>[\d,.]+)\s+'
            .'(?:(?<wash_sale>[\d,.]+)\s+W|\.{3}|[-—–])?\s+'
            .'(?<gain_loss>-?[\d,.]+)\s*'
            .'(?<additional_info>.*)$/i';

        if (preg_match($pattern, $line, $matches) !== 1) {
            return null;
        }

        $saleDate = $this->parseDate($matches['sale_date']);
        if ($saleDate === null) {
            return null;
        }

        $dateAcquiredVarious = strcasecmp(trim($matches['purchase_date']), 'Various') === 0;
        $purchaseDate = $this->parseDate($matches['purchase_date']) ?? $saleDate;
        $additionalInfo = trim($matches['additional_info']);
        if ($dateAcquiredVarious) {
            $additionalInfo = trim('Date acquired reported as Various. '.$additionalInfo);
        }
        $washSale = (string) $matches['wash_sale'];

        return [
            'symbol' => $symbol,
            'description' => $description,
            'cusip' => $cusip,
            'quantity' => $this->amount($matches['quantity']),
            'purchase_date' => $purchaseDate,
            'sale_date' => $saleDate,
            'cost_basis' => round($this->amount($matches['cost_basis']), 4),
            'proceeds' => round($this->amount($matches['proceeds']), 4),
            'realized_gain_loss' => round($this->amount($matches['gain_loss']), 4),
            'wash_sale_disallowed' => round($this->amount($washSale), 4),
            'is_short_term' => $isShortTerm,
            'form_8949_box' => $isShortTerm ? 'A' : 'D',
            'is_covered' => true,
            'date_acquired_various' => $dateAcquiredVarious,
            'skip_transaction_matching' => true,
            'additional_info' => $additionalInfo,
        ];
    }

    private function parseDate(string $raw): ?string
    {
        $raw = trim($raw);
        if (strcasecmp($raw, 'Various') === 0) {
            return null;
        }

        if (preg_match('#^(\d{2})/(\d{2})/(\d{2})$#', $raw, $matches) !== 1) {
            return null;
        }

        $year = (int) $matches[3];
        // Wealthfront 1099-B uses two-digit years; accept current/future filings through 2035 before falling back to 19xx legacy dates.
        $century = $year <= 35 ? 2000 : 1900;

        return sprintf('%04d-%02d-%02d', $century + $year, (int) $matches[1], (int) $matches[2]);
    }

    private function amount(string $raw): float
    {
        return (float) str_replace(',', '', trim($raw));
    }
}
