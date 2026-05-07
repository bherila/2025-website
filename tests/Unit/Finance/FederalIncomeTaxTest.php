<?php

namespace Tests\Unit\Finance;

use App\Support\Finance\FederalIncomeTax;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class FederalIncomeTaxTest extends TestCase
{
    public function test_ordinary_tax_walks_brackets_for_2025_single(): void
    {
        $tax = FederalIncomeTax::ordinaryTax(50000.0, 2025, false);

        // 11925 * 0.10 + (48475 - 11925) * 0.12 + (50000 - 48475) * 0.22
        // = 1192.50 + 4386.00 + 335.50 = 5914.00
        $this->assertEqualsWithDelta(5914.00, $tax, 0.01);
    }

    public function test_qd_ltcg_stacking_reduces_tax_versus_ordinary_treatment(): void
    {
        $taxableIncome = 200000.0;
        $qualifiedDividends = 80000.0;

        $regular = FederalIncomeTax::regularTax($taxableIncome, 2025, false, $qualifiedDividends);
        $ordinaryOnly = FederalIncomeTax::ordinaryTax($taxableIncome, 2025, false);

        $this->assertLessThan($ordinaryOnly, $regular);
    }

    public function test_regular_tax_falls_back_to_ordinary_when_no_preferential_income(): void
    {
        $taxableIncome = 75000.0;

        $this->assertSame(
            FederalIncomeTax::ordinaryTax($taxableIncome, 2025, true),
            FederalIncomeTax::regularTax($taxableIncome, 2025, true),
        );
    }

    public function test_unsupported_year_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/year 2030/');

        FederalIncomeTax::regularTax(50000.0, 2030, false);
    }
}
