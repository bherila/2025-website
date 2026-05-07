<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Schedule3Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $line1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line2Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line3Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line4Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line5aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line5bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line6Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line9Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line10Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line11Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line12Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line13Sources;

    /**
     * @param  TaxFactSource[]  $line1Sources
     * @param  TaxFactSource[]  $line2Sources
     * @param  TaxFactSource[]  $line3Sources
     * @param  TaxFactSource[]  $line4Sources
     * @param  TaxFactSource[]  $line5aSources
     * @param  TaxFactSource[]  $line5bSources
     * @param  TaxFactSource[]  $line6Sources
     * @param  TaxFactSource[]  $line9Sources
     * @param  TaxFactSource[]  $line10Sources
     * @param  TaxFactSource[]  $line11Sources
     * @param  TaxFactSource[]  $line12Sources
     * @param  TaxFactSource[]  $line13Sources
     */
    public function __construct(
        array $line1Sources,
        public float $line1ForeignTaxCredit,
        array $line2Sources,
        public float $line2ChildDependentCareCredit,
        array $line3Sources,
        public float $line3EducationCredits,
        array $line4Sources,
        public float $line4RetirementSavingsCredit,
        array $line5aSources,
        public float $line5aResidentialCleanEnergyCredit,
        array $line5bSources,
        public float $line5bEnergyEfficientHomeImprovementCredit,
        array $line6Sources,
        public float $line7OtherNonrefundableCredits,
        public float $line8TotalNonrefundableCredits,
        array $line9Sources,
        public float $line9NetPremiumTaxCredit,
        array $line10Sources,
        public float $line10ExtensionPayment,
        array $line11Sources,
        public float $line11ExcessSocialSecurityWithheld,
        array $line12Sources,
        public float $line12FuelTaxCredit,
        array $line13Sources,
        public float $line14OtherPaymentsRefundableCredits,
        public float $line15TotalPaymentsRefundableCredits,
    ) {
        $this->line1Sources = $line1Sources;
        $this->line2Sources = $line2Sources;
        $this->line3Sources = $line3Sources;
        $this->line4Sources = $line4Sources;
        $this->line5aSources = $line5aSources;
        $this->line5bSources = $line5bSources;
        $this->line6Sources = $line6Sources;
        $this->line9Sources = $line9Sources;
        $this->line10Sources = $line10Sources;
        $this->line11Sources = $line11Sources;
        $this->line12Sources = $line12Sources;
        $this->line13Sources = $line13Sources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'line1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line1Sources),
            'line1ForeignTaxCredit' => $this->line1ForeignTaxCredit,
            'line2Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line2Sources),
            'line2ChildDependentCareCredit' => $this->line2ChildDependentCareCredit,
            'line3Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line3Sources),
            'line3EducationCredits' => $this->line3EducationCredits,
            'line4Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line4Sources),
            'line4RetirementSavingsCredit' => $this->line4RetirementSavingsCredit,
            'line5aSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line5aSources),
            'line5aResidentialCleanEnergyCredit' => $this->line5aResidentialCleanEnergyCredit,
            'line5bSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line5bSources),
            'line5bEnergyEfficientHomeImprovementCredit' => $this->line5bEnergyEfficientHomeImprovementCredit,
            'line6Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line6Sources),
            'line7OtherNonrefundableCredits' => $this->line7OtherNonrefundableCredits,
            'line8TotalNonrefundableCredits' => $this->line8TotalNonrefundableCredits,
            'line9Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line9Sources),
            'line9NetPremiumTaxCredit' => $this->line9NetPremiumTaxCredit,
            'line10Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line10Sources),
            'line10ExtensionPayment' => $this->line10ExtensionPayment,
            'line11Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line11Sources),
            'line11ExcessSocialSecurityWithheld' => $this->line11ExcessSocialSecurityWithheld,
            'line12Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line12Sources),
            'line12FuelTaxCredit' => $this->line12FuelTaxCredit,
            'line13Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line13Sources),
            'line14OtherPaymentsRefundableCredits' => $this->line14OtherPaymentsRefundableCredits,
            'line15TotalPaymentsRefundableCredits' => $this->line15TotalPaymentsRefundableCredits,
        ];
    }
}
