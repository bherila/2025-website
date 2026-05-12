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

    public function test_auto_delimited_parser_prefers_tabs_when_commas_are_tied(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane Doe\tAustin, TX", 'auto');

        $this->assertSame([['Jane Doe', 'Austin, TX']], $rows);
    }

    public function test_blank_line_blocks_mode(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane\n123 Main\n\nJohn\n44 Oak", 'auto');

        $this->assertCount(2, $rows);
        $this->assertSame(['Jane', '123 Main'], $rows[0]);
    }

    public function test_mixed_windows_and_unix_line_endings_parse(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane Doe\t123 Main\r\nJohn Doe\t44 Oak\nAustin\tTX", 'delimited');

        $this->assertSame([['Jane Doe', '123 Main'], ['John Doe', '44 Oak'], ['Austin', 'TX']], $rows);
    }

    public function test_explicit_block_mode_preserves_comma_address_lines(): void
    {
        $parser = new AddressLabelParser;
        $rows = $parser->parse("Jane Doe\nAustin, TX 78701\n\nJohn Doe\nSeattle, WA 98101", 'blocks');

        $this->assertSame([['Jane Doe', 'Austin, TX 78701'], ['John Doe', 'Seattle, WA 98101']], $rows);
    }
}
