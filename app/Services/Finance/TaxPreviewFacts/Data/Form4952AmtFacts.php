<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

/**
 * Parallel Alternative Minimum Tax computation of Form 4952 (Investment Interest
 * Expense Deduction).
 *
 * AMT can diverge from the regular-tax form when investment income or expense differs
 * for AMT purposes — e.g. interest on specified private-activity bonds is investment
 * income for AMT only (IRC §57(a)(5)), or a K-1 Box 17B basis adjustment changes the
 * AMT net gain from the disposition of investment property (IRC §56(a)(6)).
 *
 * The regular-vs-AMT difference in the line 8 deduction is reported on Form 6251
 * line 2c (IRC §56(b)(1)(C)): a positive amount — regular-tax deduction minus AMT
 * deduction — is added back to alternative minimum taxable income. When there are no
 * AMT differences, every line equals the regular-tax form and {@see $line2cAdjustment}
 * is 0.
 */
#[TypeScript]
readonly class Form4952AmtFacts
{
    public function __construct(
        public float $line1to3InvestmentInterest,
        public float $line4aGrossInvestmentIncome,
        public float $line4bQualifiedDividends,
        public float $line4cAfterQualifiedDividends,
        public float $line4dNetGainFromDisposition,
        public float $line4eNetCapitalGainFromDisposition,
        public float $line4fNetShortTermFromDisposition,
        public float $line4gElected,
        public float $line4hTotalInvestmentIncome,
        public float $line5InvestmentExpenses,
        public float $line6NetInvestmentIncome,
        public float $line7DisallowedCarryforward,
        public float $line8DeductibleInvestmentInterest,
        public float $line2cAdjustment,
    ) {}

    public static function empty(): self
    {
        return new self(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    }

    /**
     * @return array{line1to3InvestmentInterest:float,line4aGrossInvestmentIncome:float,line4bQualifiedDividends:float,line4cAfterQualifiedDividends:float,line4dNetGainFromDisposition:float,line4eNetCapitalGainFromDisposition:float,line4fNetShortTermFromDisposition:float,line4gElected:float,line4hTotalInvestmentIncome:float,line5InvestmentExpenses:float,line6NetInvestmentIncome:float,line7DisallowedCarryforward:float,line8DeductibleInvestmentInterest:float,line2cAdjustment:float}
     */
    public function toArray(): array
    {
        return [
            'line1to3InvestmentInterest' => $this->line1to3InvestmentInterest,
            'line4aGrossInvestmentIncome' => $this->line4aGrossInvestmentIncome,
            'line4bQualifiedDividends' => $this->line4bQualifiedDividends,
            'line4cAfterQualifiedDividends' => $this->line4cAfterQualifiedDividends,
            'line4dNetGainFromDisposition' => $this->line4dNetGainFromDisposition,
            'line4eNetCapitalGainFromDisposition' => $this->line4eNetCapitalGainFromDisposition,
            'line4fNetShortTermFromDisposition' => $this->line4fNetShortTermFromDisposition,
            'line4gElected' => $this->line4gElected,
            'line4hTotalInvestmentIncome' => $this->line4hTotalInvestmentIncome,
            'line5InvestmentExpenses' => $this->line5InvestmentExpenses,
            'line6NetInvestmentIncome' => $this->line6NetInvestmentIncome,
            'line7DisallowedCarryforward' => $this->line7DisallowedCarryforward,
            'line8DeductibleInvestmentInterest' => $this->line8DeductibleInvestmentInterest,
            'line2cAdjustment' => $this->line2cAdjustment,
        ];
    }
}
