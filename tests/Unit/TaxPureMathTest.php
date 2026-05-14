<?php

namespace Tests\Unit;

use App\Services\Tax\PureTaxMath\FederalBrackets;
use App\Services\Tax\PureTaxMath\FilingStatus;
use App\Services\Tax\PureTaxMath\Inflation;
use App\Services\Tax\PureTaxMath\Irmaa;
use App\Services\Tax\PureTaxMath\ItemizedDeductions;
use App\Services\Tax\PureTaxMath\Niit;
use App\Services\Tax\PureTaxMath\Rmd;
use App\Services\Tax\PureTaxMath\SocialSecurity;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class TaxPureMathTest extends TestCase
{
    public function test_ordinary_tax_uses_2026_single_brackets(): void
    {
        $this->assertSame(5752.0, FederalBrackets::taxOnOrdinary(2026, FilingStatus::Single, 50000.0));
    }

    public function test_long_term_gains_stack_on_top_of_ordinary_income(): void
    {
        $tax = FederalBrackets::taxOnLongTermGains(2026, FilingStatus::Single, 40000.0, 20000.0);

        $this->assertSame(1582.5, $tax);
    }

    public function test_capital_gain_zero_rate_ceiling_uses_preferential_threshold_table(): void
    {
        $this->assertSame(48350.0, FederalBrackets::capitalGainZeroRateCeiling(2025, FilingStatus::Single));
        $this->assertSame(49450.0, FederalBrackets::capitalGainZeroRateCeiling(2026, FilingStatus::Single));
    }

    public function test_social_security_taxable_portion_caps_at_85_percent(): void
    {
        $taxable = SocialSecurity::taxablePortion(FilingStatus::Single, 40000.0, 200000.0);

        $this->assertSame(34000.0, $taxable);
    }

    public function test_niit_uses_lesser_of_investment_income_and_magi_excess(): void
    {
        $tax = Niit::tax(FilingStatus::Single, 210000.0, 50000.0);

        $this->assertSame(380.0, $tax);
    }

    public function test_irmaa_tier_and_rmd_rules(): void
    {
        $tier = Irmaa::tierFor(2026, FilingStatus::MarriedFilingJointly, 300000.0);

        $this->assertSame('Tier 2', $tier->label);
        $this->assertSame(26.5, Rmd::divisor(73));
        $this->assertSame(73, Rmd::requiredBeginningAge(1959));
        $this->assertSame(75, Rmd::requiredBeginningAge(1960));
    }

    public function test_inflation_projection_compounds_threshold(): void
    {
        $this->assertSame(11038.13, Inflation::projectThreshold(10000.0, 2026, 2030, 0.025));
    }

    public function test_itemized_deduction_math_covers_salt_medical_and_prop_13(): void
    {
        $this->assertSame(37400.0, ItemizedDeductions::saltCap(2026, 515000.0));
        $this->assertSame(12500.0, ItemizedDeductions::medicalExpenseDeduction(20000.0, 100000.0));
        $this->assertSame(0.02, ItemizedDeductions::propertyTaxGrowthRate(0.06, true));
    }

    public function test_unknown_filing_status_input_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        FilingStatus::fromInput('married_separately');
    }
}
