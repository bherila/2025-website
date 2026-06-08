<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class PartnershipBasisWorksheetFacts
{
    public function __construct(
        public float $beginningOutsideBasis,
        public float $capitalContributions,
        public float $taxableIncomeIncrease,
        public float $taxExemptIncomeIncrease,
        public float $liabilityIncrease,
        public float $cashDistributions,
        public float $propertyDistributionsBasis,
        public float $liabilityDecrease,
        public float $deductionsLossesDecrease,
        public float $nondeductibleExpensesDecrease,
        public float $foreignTaxesDecrease,
        public float $distributionGain,
        public float $suspendedLossCarryforward,
        public float $endingOutsideBasis,
        public ?float $liquidationGainLoss,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'beginningOutsideBasis' => $this->beginningOutsideBasis,
            'capitalContributions' => $this->capitalContributions,
            'taxableIncomeIncrease' => $this->taxableIncomeIncrease,
            'taxExemptIncomeIncrease' => $this->taxExemptIncomeIncrease,
            'liabilityIncrease' => $this->liabilityIncrease,
            'cashDistributions' => $this->cashDistributions,
            'propertyDistributionsBasis' => $this->propertyDistributionsBasis,
            'liabilityDecrease' => $this->liabilityDecrease,
            'deductionsLossesDecrease' => $this->deductionsLossesDecrease,
            'nondeductibleExpensesDecrease' => $this->nondeductibleExpensesDecrease,
            'foreignTaxesDecrease' => $this->foreignTaxesDecrease,
            'distributionGain' => $this->distributionGain,
            'suspendedLossCarryforward' => $this->suspendedLossCarryforward,
            'endingOutsideBasis' => $this->endingOutsideBasis,
            'liquidationGainLoss' => $this->liquidationGainLoss,
        ];
    }
}
