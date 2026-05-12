<?php

namespace Tests\Unit;

use App\Support\AddressLabelParser;
use PHPUnit\Framework\TestCase;

class AddressLabelParserTest extends TestCase
{
    public function test_csv_with_quoted_commas_and_newline_parses(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("\"Acme, Inc.\",\"Attn: Jane\nSuite 10\",Austin", 'delimited');

        $this->assertSame(['Acme, Inc.', 'Attn: Jane', 'Suite 10', 'Austin'], $rows[0]);
    }

    public function test_tsv_preserves_empty_middle_cell(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane Doe\t\t123 Main St", 'delimited');

        $this->assertCount(3, $rows[0]);
        $this->assertSame('', $rows[0][1]);
    }

    public function test_blank_line_blocks_mode(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane\n123 Main\n\nJohn\n44 Oak", 'auto');

        $this->assertCount(2, $rows);
        $this->assertSame(['Jane', '123 Main'], $rows[0]);
    }
}
