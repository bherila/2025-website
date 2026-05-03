<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\Form8949ExportLot;
use App\Services\Finance\OltXlsxWriter;
use App\Services\Finance\TxfWriter;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PHPUnit\Framework\TestCase;

class Form8949ExportWritersTest extends TestCase
{
    public function test_txf_writer_maps_all_form_8949_boxes(): void
    {
        $lots = [
            $this->lot('A', true),
            $this->lot('B', true),
            $this->lot('C', true),
            $this->lot('D', false),
            $this->lot('E', false),
            $this->lot('F', false),
        ];

        $txf = (new TxfWriter)->write($lots);

        $this->assertStringContainsString("N321\r\n", $txf);
        $this->assertStringContainsString("N711\r\n", $txf);
        $this->assertStringContainsString("N712\r\n", $txf);
        $this->assertStringContainsString("N323\r\n", $txf);
        $this->assertStringContainsString("N713\r\n", $txf);
        $this->assertStringContainsString("N714\r\n", $txf);
        $this->assertSame(7, substr_count($txf, "\r\n^\r\n"));
    }

    public function test_txf_writer_includes_wash_sale_adjustment_when_present(): void
    {
        $txf = (new TxfWriter)->write([
            $this->lot('A', true, adjustmentAmount: 500.0, adjustmentCode: 'W', washSaleDisallowed: 500.0),
        ]);

        $this->assertStringContainsString('$500.00', $txf);
    }

    public function test_txf_writer_does_not_emit_non_wash_adjustment_amount(): void
    {
        $txf = (new TxfWriter)->write([
            $this->lot('A', true, adjustmentAmount: 500.0),
        ]);

        $this->assertStringNotContainsString('$500.00', $txf);
    }

    public function test_olt_xlsx_writer_creates_template_sheet_with_lot_rows(): void
    {
        $content = (new OltXlsxWriter)->write([
            $this->lot('B', true, isCovered: false, accruedMarketDiscount: 12.34, adjustmentAmount: 500.0, adjustmentCode: 'W'),
            $this->lot('D', false),
        ]);

        $tempPath = tempnam(sys_get_temp_dir(), 'olt-export-test');
        file_put_contents($tempPath, $content);
        $spreadsheet = IOFactory::load($tempPath);
        @unlink($tempPath);

        $sheet = $spreadsheet->getSheet(0);
        $this->assertSame('OLT Template', $sheet->getTitle());
        $this->assertSame('Description of capital asset', $sheet->getCell('A1')->getValue());
        $this->assertSame('Example Lot B', $sheet->getCell('A2')->getValue());
        $this->assertSame('Short', $sheet->getCell('J2')->getValue());
        $this->assertSame('Yes', $sheet->getCell('M2')->getValue());
        $this->assertSame('B', $sheet->getCell('R2')->getValue());
        $this->assertSame('Long', $sheet->getCell('J3')->getValue());
        $this->assertSame('D', $sheet->getCell('R3')->getValue());
    }

    private function lot(
        string $box,
        bool $isShortTerm,
        float $adjustmentAmount = 0.0,
        ?string $adjustmentCode = null,
        ?bool $isCovered = true,
        ?float $accruedMarketDiscount = null,
        ?float $washSaleDisallowed = null,
    ): Form8949ExportLot {
        return new Form8949ExportLot(
            description: "Example Lot {$box}",
            dateAcquired: '2024-01-15',
            dateSold: '2025-02-20',
            proceeds: 1200.0,
            costBasis: 700.0,
            adjustmentAmount: $adjustmentAmount,
            adjustmentCode: $adjustmentCode,
            isShortTerm: $isShortTerm,
            form8949Box: $box,
            quantity: 10.0,
            symbol: 'AAPL',
            accountName: 'Brokerage',
            payerName: 'Fidelity',
            payerTin: '12-3456789',
            isCovered: $isCovered,
            accruedMarketDiscount: $accruedMarketDiscount,
            washSaleDisallowed: $washSaleDisallowed,
        );
    }
}
