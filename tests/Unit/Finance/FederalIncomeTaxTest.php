<?php

namespace Tests\Unit\Finance;

use App\Services\Tax\PureTaxMath\FederalBrackets;
use App\Services\Tax\PureTaxMath\FilingStatus;
use App\Support\Finance\FederalIncomeTax;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

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

    public function test_modern_year_ordinary_tax_matches_pure_tax_math(): void
    {
        $this->assertSame(
            FederalBrackets::taxOnOrdinary(2025, FilingStatus::Single, 50000.0),
            FederalIncomeTax::ordinaryTax(50000.0, 2025, false),
        );
        $this->assertSame(
            FederalBrackets::taxOnOrdinary(2026, FilingStatus::MarriedFilingJointly, 150000.0),
            FederalIncomeTax::ordinaryTax(150000.0, 2026, true),
        );
    }

    public function test_unsupported_year_uses_nearest_configured_table(): void
    {
        $this->assertSame(
            FederalIncomeTax::ordinaryTax(50000.0, 2023, false),
            FederalIncomeTax::ordinaryTax(50000.0, 2022, false),
        );
        $this->assertSame(
            FederalIncomeTax::regularTax(50000.0, 2026, false, 10000.0),
            FederalIncomeTax::regularTax(50000.0, 2030, false, 10000.0),
        );
    }

    public function test_future_year_fallback_logs_warning(): void
    {
        Log::shouldReceive('warning')
            ->once()
            ->with('Federal income tax brackets unavailable for 2030; falling back to 2026', [
                'requested_year' => 2030,
                'table_year' => 2026,
            ]);

        $this->assertSame(
            FederalIncomeTax::regularTax(50000.0, 2026, false, 10000.0),
            FederalIncomeTax::regularTax(50000.0, 2030, false, 10000.0),
        );
    }
}
