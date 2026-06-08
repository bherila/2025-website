<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\IrsFieldValueFormatter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IrsFieldValueFormatterTest extends TestCase
{
    use RefreshDatabase;

    public function test_formats_amounts_as_whole_dollars_and_can_blank_zero(): void
    {
        $formatter = new IrsFieldValueFormatter;

        $this->assertSame('1235', $formatter->format(1234.56, ['format' => 'amount']));
        $this->assertNull($formatter->format(0, ['format' => 'amount', 'blankIfZero' => true]));
    }

    public function test_formats_checkbox_values_with_checked_when(): void
    {
        $formatter = new IrsFieldValueFormatter;

        $this->assertTrue($formatter->format('single', ['format' => 'checkbox', 'checkedWhen' => 'single']));
        $this->assertFalse($formatter->format('single', ['format' => 'checkbox', 'checkedWhen' => 'married_filing_jointly']));
        $this->assertSame('4', $formatter->format('head_of_household', [
            'format' => 'checkbox',
            'checkedWhen' => 'head_of_household',
            'onValue' => '4',
        ]));
        $this->assertSame('5', $formatter->format('qualifying_surviving_spouse', [
            'format' => 'checkbox',
            'checkedValues' => [
                'married_filing_jointly' => '2',
                'qualifying_surviving_spouse' => '5',
            ],
        ]));
        $this->assertFalse($formatter->format('single', [
            'format' => 'checkbox',
            'checkedValues' => [
                'married_filing_jointly' => '2',
                'qualifying_surviving_spouse' => '5',
            ],
        ]));
    }

    public function test_formats_identifiers_dates_and_phone_numbers(): void
    {
        $formatter = new IrsFieldValueFormatter;

        $this->assertSame('123-45-6789', $formatter->format('123456789', ['format' => 'ssn']));
        $this->assertSame('45', $formatter->format('123456789', ['format' => 'ssn', 'segment' => 2]));
        $this->assertSame('12-3456789', $formatter->format('123456789', ['format' => 'ein']));
        $this->assertSame('01/02/2025', $formatter->format('2025-01-02', ['format' => 'date']));
        $this->assertSame('(555) 123-4567', $formatter->format('5551234567', ['format' => 'phone']));
    }
}
