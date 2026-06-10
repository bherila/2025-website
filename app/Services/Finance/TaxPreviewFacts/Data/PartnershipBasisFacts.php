<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisFacts
{
    /** @var PartnershipBasisInterestFacts[] */
    public array $interests;

    /** @var TaxFactSource[] */
    public array $distributionGainSources;

    /** @var TaxFactSource[] */
    public array $liquidationGainLossSources;

    /** @var TaxFactSource[] */
    public array $propertyDistributionSources;

    /** @var TaxFactSource[] */
    public array $form7217RequiredSources;

    /** @var TaxFactSource[] */
    public array $section754StepUpSources;

    /** @var Form8949RowFact[] */
    public array $form8949Rows;

    /** @var PartnershipBasisReconciliationFacts[] */
    public array $reconciliations;

    /**
     * @param  PartnershipBasisInterestFacts[]  $interests
     * @param  TaxFactSource[]  $distributionGainSources  Excess cash-distribution gains (gain
     *                                                    from the sale/exchange of the interest),
     *                                                    reviewable and routed to Schedule D line 3
     *                                                    (short-term) or line 10 (long-term).
     * @param  TaxFactSource[]  $liquidationGainLossSources  Review-only liquidation gain/loss estimates.
     * @param  TaxFactSource[]  $propertyDistributionSources  Property distributions that reduce/reallocate
     *                                                        outside basis without cash-distribution gain.
     * @param  TaxFactSource[]  $form7217RequiredSources  Property distributions that may require Form 7217
     *                                                    support for tax years 2024 and later.
     * @param  TaxFactSource[]  $section754StepUpSources  §754/§743(b) step-up amortization (Box 13 code W),
     *                                                    surfaced for review separately from the other
     *                                                    Box 13 code-L portfolio deductions.
     * @param  Form8949RowFact[]  $form8949Rows  Form 8949 disposition rows for §731 gains with a
     *                                           determinable holding period.
     * @param  PartnershipBasisReconciliationFacts[]  $reconciliations  Read-only transaction/statement
     *                                                                  reconciliation per account.
     */
    public function __construct(
        public int $year,
        array $interests,
        array $distributionGainSources = [],
        array $liquidationGainLossSources = [],
        array $propertyDistributionSources = [],
        array $form7217RequiredSources = [],
        array $section754StepUpSources = [],
        array $form8949Rows = [],
        array $reconciliations = [],
    ) {
        $this->interests = $interests;
        $this->distributionGainSources = $distributionGainSources;
        $this->liquidationGainLossSources = $liquidationGainLossSources;
        $this->propertyDistributionSources = $propertyDistributionSources;
        $this->form7217RequiredSources = $form7217RequiredSources;
        $this->section754StepUpSources = $section754StepUpSources;
        $this->form8949Rows = $form8949Rows;
        $this->reconciliations = $reconciliations;
    }

    public static function empty(int $year): self
    {
        return new self($year, [], [], [], [], [], [], [], []);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'interestCount' => count($this->interests),
            'interests' => array_map(static fn (PartnershipBasisInterestFacts $interest): array => $interest->toArray(), $this->interests),
            'distributionGainSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->distributionGainSources),
            'liquidationGainLossSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->liquidationGainLossSources),
            'propertyDistributionSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->propertyDistributionSources),
            'form7217RequiredSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->form7217RequiredSources),
            'section754StepUpSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->section754StepUpSources),
            'form8949Rows' => array_map(static fn (Form8949RowFact $row): array => $row->toArray(), $this->form8949Rows),
            'reconciliations' => array_map(static fn (PartnershipBasisReconciliationFacts $reconciliation): array => $reconciliation->toArray(), $this->reconciliations),
        ];
    }
}
