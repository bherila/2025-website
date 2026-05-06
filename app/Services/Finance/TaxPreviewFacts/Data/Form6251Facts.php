<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form6251Facts
{
    /**
     * @var Form6251SourceEntryFact[]
     */
    public array $sourceEntries;

    /**
     * @var string[]
     */
    public array $manualReviewReasons;

    /**
     * @param  Form6251SourceEntryFact[]  $sourceEntries
     * @param  string[]  $manualReviewReasons
     */
    public function __construct(
        public float $line1TaxableIncome,
        public float $line2aTaxesOrStandardDeduction,
        public string $line2aSource,
        public float $line2cInvestmentInterest,
        public float $line2dDepletion,
        public float $line2kDispositionOfProperty,
        public float $line2lPost1986Depreciation,
        public float $line2mPassiveActivities,
        public float $line2nLossLimitations,
        public float $line2tIntangibleDrillingCosts,
        public float $line3OtherAdjustments,
        public float $adjustmentTotal,
        public float $amti,
        public float $exemption,
        public float $exemptionBase,
        public float $exemptionReduction,
        public float $exemptionPhaseoutThreshold,
        public float $amtTaxBase,
        public float $amtRateSplitThreshold,
        public float $amtBeforeForeignCredit,
        public float $line8AmtForeignTaxCredit,
        public float $tentativeMinTax,
        public float $regularTax,
        public float $regularForeignTaxCredit,
        public float $regularTaxAfterCredits,
        public float $amt,
        public string $filingStatus,
        array $sourceEntries,
        public bool $requiresStatementReview,
        array $manualReviewReasons,
    ) {
        $this->sourceEntries = $sourceEntries;
        $this->manualReviewReasons = $manualReviewReasons;
    }

    public static function empty(): self
    {
        return new self(
            line1TaxableIncome: 0.0,
            line2aTaxesOrStandardDeduction: 0.0,
            line2aSource: 'none',
            line2cInvestmentInterest: 0.0,
            line2dDepletion: 0.0,
            line2kDispositionOfProperty: 0.0,
            line2lPost1986Depreciation: 0.0,
            line2mPassiveActivities: 0.0,
            line2nLossLimitations: 0.0,
            line2tIntangibleDrillingCosts: 0.0,
            line3OtherAdjustments: 0.0,
            adjustmentTotal: 0.0,
            amti: 0.0,
            exemption: 0.0,
            exemptionBase: 0.0,
            exemptionReduction: 0.0,
            exemptionPhaseoutThreshold: 0.0,
            amtTaxBase: 0.0,
            amtRateSplitThreshold: 0.0,
            amtBeforeForeignCredit: 0.0,
            line8AmtForeignTaxCredit: 0.0,
            tentativeMinTax: 0.0,
            regularTax: 0.0,
            regularForeignTaxCredit: 0.0,
            regularTaxAfterCredits: 0.0,
            amt: 0.0,
            filingStatus: 'single',
            sourceEntries: [],
            requiresStatementReview: false,
            manualReviewReasons: [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'line1TaxableIncome' => $this->line1TaxableIncome,
            'line2aTaxesOrStandardDeduction' => $this->line2aTaxesOrStandardDeduction,
            'line2aSource' => $this->line2aSource,
            'line2cInvestmentInterest' => $this->line2cInvestmentInterest,
            'line2dDepletion' => $this->line2dDepletion,
            'line2kDispositionOfProperty' => $this->line2kDispositionOfProperty,
            'line2lPost1986Depreciation' => $this->line2lPost1986Depreciation,
            'line2mPassiveActivities' => $this->line2mPassiveActivities,
            'line2nLossLimitations' => $this->line2nLossLimitations,
            'line2tIntangibleDrillingCosts' => $this->line2tIntangibleDrillingCosts,
            'line3OtherAdjustments' => $this->line3OtherAdjustments,
            'adjustmentTotal' => $this->adjustmentTotal,
            'amti' => $this->amti,
            'exemption' => $this->exemption,
            'exemptionBase' => $this->exemptionBase,
            'exemptionReduction' => $this->exemptionReduction,
            'exemptionPhaseoutThreshold' => $this->exemptionPhaseoutThreshold,
            'amtTaxBase' => $this->amtTaxBase,
            'amtRateSplitThreshold' => $this->amtRateSplitThreshold,
            'amtBeforeForeignCredit' => $this->amtBeforeForeignCredit,
            'line8AmtForeignTaxCredit' => $this->line8AmtForeignTaxCredit,
            'tentativeMinTax' => $this->tentativeMinTax,
            'regularTax' => $this->regularTax,
            'regularForeignTaxCredit' => $this->regularForeignTaxCredit,
            'regularTaxAfterCredits' => $this->regularTaxAfterCredits,
            'amt' => $this->amt,
            'filingStatus' => $this->filingStatus,
            'sourceEntries' => array_map(static fn (Form6251SourceEntryFact $entry): array => $entry->toArray(), $this->sourceEntries),
            'requiresStatementReview' => $this->requiresStatementReview,
            'manualReviewReasons' => $this->manualReviewReasons,
        ];
    }
}
