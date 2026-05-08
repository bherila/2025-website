<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleSEFacts
{
    /**
     * @var TaxFactSource[]
     */
    public array $entries;

    /**
     * @var TaxFactSource[]
     */
    public array $wageSources;

    /**
     * @var TaxFactSource[]
     */
    public array $medicareTaxWithheldSources;

    /**
     * @var TaxFactSource[]
     */
    public array $scheduleFSources;

    /**
     * @param  TaxFactSource[]  $entries
     * @param  TaxFactSource[]  $wageSources
     * @param  TaxFactSource[]  $medicareTaxWithheldSources
     * @param  TaxFactSource[]  $scheduleFSources
     */
    public function __construct(
        array $entries,
        public float $netEarningsFromSE,
        public float $seTaxableEarnings,
        public float $socialSecurityWageBase,
        public float $socialSecurityWages,
        public float $remainingSocialSecurityWageBase,
        public float $socialSecurityTaxableEarnings,
        public float $socialSecurityTax,
        public float $medicareWages,
        array $medicareTaxWithheldSources,
        public float $medicareTaxWithheld,
        public float $medicareTaxableEarnings,
        public float $medicareTax,
        public float $additionalMedicareThreshold,
        public float $additionalMedicareTaxableEarnings,
        public float $additionalMedicareTax,
        public float $seTax,
        public float $deductibleSeTax,
        array $wageSources,
        array $scheduleFSources,
    ) {
        $this->entries = $entries;
        $this->wageSources = $wageSources;
        $this->medicareTaxWithheldSources = $medicareTaxWithheldSources;
        $this->scheduleFSources = $scheduleFSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entries' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->entries),
            'netEarningsFromSE' => $this->netEarningsFromSE,
            'seTaxableEarnings' => $this->seTaxableEarnings,
            'socialSecurityWageBase' => $this->socialSecurityWageBase,
            'socialSecurityWages' => $this->socialSecurityWages,
            'remainingSocialSecurityWageBase' => $this->remainingSocialSecurityWageBase,
            'socialSecurityTaxableEarnings' => $this->socialSecurityTaxableEarnings,
            'socialSecurityTax' => $this->socialSecurityTax,
            'medicareWages' => $this->medicareWages,
            'medicareTaxWithheldSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->medicareTaxWithheldSources),
            'medicareTaxWithheld' => $this->medicareTaxWithheld,
            'medicareTaxableEarnings' => $this->medicareTaxableEarnings,
            'medicareTax' => $this->medicareTax,
            'additionalMedicareThreshold' => $this->additionalMedicareThreshold,
            'additionalMedicareTaxableEarnings' => $this->additionalMedicareTaxableEarnings,
            'additionalMedicareTax' => $this->additionalMedicareTax,
            'seTax' => $this->seTax,
            'deductibleSeTax' => $this->deductibleSeTax,
            'wageSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->wageSources),
            'scheduleFSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->scheduleFSources),
        ];
    }
}
