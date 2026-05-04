<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\Exceptions\WealthfrontPdfParseException;
use App\Services\Finance\Wealthfront1099BLotParser;
use PHPUnit\Framework\TestCase;

class Wealthfront1099BLotParserTest extends TestCase
{
    public function test_parse_extracts_short_long_various_and_multiline_lots(): void
    {
        $parser = new Wealthfront1099BLotParser;

        $lots = $parser->parse(implode("\n", [
            'SHORT TERM TRANSACTIONS FOR COVERED TAX LOTS (Box 12 is checked)',
            'ABBOTT LABS COM / CUSIP: 002824100 / Symbol:',
            '04/14/25    2.000    255.14',
            'V a r i o u s',
            '262.93    ...    -7.79    Total of 2 transactions',
            'SCHWAB CHARLES CORP COM / CUSIP: 808513105 / Symbol:',
            '04/04/25    5.000    349.54    Various    361.44    11.90 W    0.00    Total of 2 transactions',
            'LONG TERM TRANSACTIONS FOR COVERED TAX LOTS (Box 12 is checked)',
            'AMAZON COM INC COM / CUSIP: 023135106 / Symbol:',
            '03/27/25    1.000    190.00    02/10/24    150.00    ...    40.00    Sale',
            'Detail for Dividends',
            '04/01/25    1.000    1.00    01/01/25    1.00    ...    0.00',
        ]));

        $this->assertCount(3, $lots);
        $this->assertSame('002824100', $lots[0]['symbol']);
        $this->assertSame('2025-04-14', $lots[0]['purchase_date']);
        $this->assertSame(-7.79, $lots[0]['realized_gain_loss']);
        $this->assertSame(11.9, $lots[1]['wash_sale_disallowed']);
        $this->assertTrue($lots[1]['is_short_term']);
        $this->assertFalse($lots[2]['is_short_term']);
        $this->assertSame('2024-02-10', $lots[2]['purchase_date']);
    }

    public function test_parse_ignores_malformed_lines(): void
    {
        $parser = new Wealthfront1099BLotParser;

        $lots = $parser->parse(implode("\n", [
            'SHORT TERM TRANSACTIONS FOR COVERED TAX LOTS (Box 12 is checked)',
            'ABBOTT LABS COM / CUSIP: 002824100 / Symbol:',
            'this is not a valid lot row',
        ]));

        $this->assertSame([], $lots);
    }

    public function test_text_from_pdf_rejects_invalid_paths_with_typed_exception(): void
    {
        $this->expectException(WealthfrontPdfParseException::class);

        (new Wealthfront1099BLotParser)->textFromPdf('/path/that/does/not/exist.pdf');
    }
}
