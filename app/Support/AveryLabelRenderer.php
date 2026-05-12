<?php

namespace App\Support;

use TCPDF;

class AveryLabelRenderer
{
    private const float LABEL_PADDING_INCHES = 0.08;

    private const float MIN_FONT_SIZE = 7.0;

    /**
     * @param  array<int, array<int, string>>  $rows
     */
    public function labelsPdf(array $rows, AveryLabelSpec $spec, float $baseFontSize, bool $center, bool $boldFirstLine, int $skipCount): string
    {
        $pdf = $this->makePdf($spec);

        $labels = array_merge(array_fill(0, $skipCount, []), $rows);
        $chunks = array_chunk($labels, $spec->labelsPerPage());

        foreach ($chunks as $pageRows) {
            $pdf->AddPage();

            for ($row = 0; $row < $spec->rows(); $row++) {
                for ($column = 0; $column < $spec->columns(); $column++) {
                    $index = ($row * $spec->columns()) + $column;
                    $lines = $pageRows[$index] ?? [];

                    if (count($lines) === 0) {
                        continue;
                    }

                    $this->writeLabel($pdf, $spec, $lines, $row, $column, $baseFontSize, $center, $boldFirstLine);
                }
            }
        }

        return $pdf->Output('labels.pdf', 'S');
    }

    public function calibrationPdf(AveryLabelSpec $spec): string
    {
        $pdf = $this->makePdf($spec);
        $pdf->AddPage();

        $this->drawRulerGrid($pdf);
        $pdf->SetDrawColor(120, 120, 120);
        $pdf->SetLineWidth(0.003);

        for ($row = 0; $row < $spec->rows(); $row++) {
            for ($column = 0; $column < $spec->columns(); $column++) {
                $x = $spec->leftMarginInches() + ($column * $spec->horizontalPitchInches());
                $y = $spec->topMarginInches() + ($row * $spec->verticalPitchInches());

                $pdf->Rect($x, $y, $spec->labelWidthInches(), $spec->labelHeightInches());
                $this->drawOriginCrosshair($pdf, $x, $y);
                $this->drawCellRuler($pdf, $x, $y, $spec->labelWidthInches(), $spec->labelHeightInches());
            }
        }

        return $pdf->Output('calibration.pdf', 'S');
    }

    private function makePdf(AveryLabelSpec $spec): TCPDF
    {
        $pdf = new TCPDF('P', 'in', strtoupper($spec->paper()), true, 'UTF-8', false);
        $pdf->SetPrintHeader(false);
        $pdf->SetPrintFooter(false);
        $pdf->SetMargins(0, 0, 0);
        $pdf->SetAutoPageBreak(false, 0);

        return $pdf;
    }

    /**
     * @param  array<int, string>  $lines
     */
    private function writeLabel(TCPDF $pdf, AveryLabelSpec $spec, array $lines, int $row, int $column, float $baseFontSize, bool $center, bool $boldFirstLine): void
    {
        $x = $spec->leftMarginInches() + ($column * $spec->horizontalPitchInches());
        $y = $spec->topMarginInches() + ($row * $spec->verticalPitchInches());
        $fontSize = $this->fontSizeFor($pdf, $lines, $spec, $baseFontSize, $boldFirstLine);
        $lineHeight = $this->lineHeight($fontSize);
        $blockHeight = count($lines) * $lineHeight;
        $availableHeight = $spec->labelHeightInches() - (self::LABEL_PADDING_INCHES * 2);
        $startY = $center
            ? $y + self::LABEL_PADDING_INCHES + max(0.0, ($availableHeight - $blockHeight) / 2)
            : $y + self::LABEL_PADDING_INCHES;

        foreach ($lines as $lineIndex => $line) {
            $pdf->SetFont('helvetica', ($boldFirstLine && $lineIndex === 0) ? 'B' : '', $fontSize);
            $pdf->SetXY($x + self::LABEL_PADDING_INCHES, $startY + ($lineIndex * $lineHeight));
            $pdf->Cell($spec->labelWidthInches() - (self::LABEL_PADDING_INCHES * 2), $lineHeight, $line, 0, 1, 'L', false, '', 1);
        }
    }

    /**
     * @param  array<int, string>  $lines
     */
    private function fontSizeFor(TCPDF $pdf, array $lines, AveryLabelSpec $spec, float $baseFontSize, bool $boldFirstLine): float
    {
        $fontSize = max(self::MIN_FONT_SIZE, $baseFontSize);
        $availableWidth = $spec->labelWidthInches() - (self::LABEL_PADDING_INCHES * 2);
        $availableHeight = $spec->labelHeightInches() - (self::LABEL_PADDING_INCHES * 2);

        while ($fontSize > self::MIN_FONT_SIZE) {
            if ($this->fits($pdf, $lines, $fontSize, $availableWidth, $availableHeight, $boldFirstLine)) {
                return $fontSize;
            }

            $fontSize -= 0.5;
        }

        return self::MIN_FONT_SIZE;
    }

    /**
     * @param  array<int, string>  $lines
     */
    private function fits(TCPDF $pdf, array $lines, float $fontSize, float $availableWidth, float $availableHeight, bool $boldFirstLine): bool
    {
        if ((count($lines) * $this->lineHeight($fontSize)) > $availableHeight) {
            return false;
        }

        foreach ($lines as $lineIndex => $line) {
            $pdf->SetFont('helvetica', ($boldFirstLine && $lineIndex === 0) ? 'B' : '', $fontSize);

            if ($pdf->GetStringWidth($line) > $availableWidth) {
                return false;
            }
        }

        return true;
    }

    private function lineHeight(float $fontSize): float
    {
        return ($fontSize / 72) * 1.35;
    }

    private function drawRulerGrid(TCPDF $pdf): void
    {
        $pdf->SetDrawColor(230, 230, 230);
        $pdf->SetLineWidth(0.001);

        for ($x = 0.0; $x <= 8.5; $x += 0.25) {
            $pdf->Line($x, 0, $x, 11);
        }

        for ($y = 0.0; $y <= 11.0; $y += 0.25) {
            $pdf->Line(0, $y, 8.5, $y);
        }
    }

    private function drawOriginCrosshair(TCPDF $pdf, float $x, float $y): void
    {
        $pdf->SetDrawColor(180, 0, 0);
        $pdf->SetLineWidth(0.006);
        $pdf->Line($x - 0.08, $y, $x + 0.08, $y);
        $pdf->Line($x, $y - 0.08, $x, $y + 0.08);
    }

    private function drawCellRuler(TCPDF $pdf, float $x, float $y, float $width, float $height): void
    {
        $pdf->SetDrawColor(175, 175, 175);
        $pdf->SetLineWidth(0.002);

        for ($offset = 0.25; $offset < $width; $offset += 0.25) {
            $pdf->Line($x + $offset, $y, $x + $offset, $y + $height);
        }

        for ($offset = 0.25; $offset < $height; $offset += 0.25) {
            $pdf->Line($x, $y + $offset, $x + $width, $y + $offset);
        }
    }
}
