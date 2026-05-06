<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8606Facts
{
    /**
     * @var Form8606SourceRowFact[]
     */
    public array $conversions;

    /**
     * @var Form8606SourceRowFact[]
     */
    public array $distributions;

    /**
     * @param  Form8606SourceRowFact[]  $conversions
     * @param  Form8606SourceRowFact[]  $distributions
     */
    public function __construct(
        public float $line1_nondeductibleContributions,
        public float $line2_priorYearBasis,
        public float $line3_totalBasis,
        public float $line6_yearEndFmv,
        public float $line7_distributionsNotConverted,
        public float $line8_convertedToRoth,
        public float $line9_total,
        public float $line10_proRataRatio,
        public float $line11_basisInConversion,
        public float $line12_basisInDistributions,
        public float $line13_totalBasisUsed,
        public float $line14_basisCarriedForward,
        public float $line15c_taxableDistributions,
        public float $line18_taxableConversions,
        public float $taxableToForm1040Line4b,
        array $conversions,
        array $distributions,
        public bool $hasActivity,
    ) {
        $this->conversions = $conversions;
        $this->distributions = $distributions;
    }

    public static function empty(): self
    {
        return new self(
            line1_nondeductibleContributions: 0.0,
            line2_priorYearBasis: 0.0,
            line3_totalBasis: 0.0,
            line6_yearEndFmv: 0.0,
            line7_distributionsNotConverted: 0.0,
            line8_convertedToRoth: 0.0,
            line9_total: 0.0,
            line10_proRataRatio: 0.0,
            line11_basisInConversion: 0.0,
            line12_basisInDistributions: 0.0,
            line13_totalBasisUsed: 0.0,
            line14_basisCarriedForward: 0.0,
            line15c_taxableDistributions: 0.0,
            line18_taxableConversions: 0.0,
            taxableToForm1040Line4b: 0.0,
            conversions: [],
            distributions: [],
            hasActivity: false,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'line1_nondeductibleContributions' => $this->line1_nondeductibleContributions,
            'line2_priorYearBasis' => $this->line2_priorYearBasis,
            'line3_totalBasis' => $this->line3_totalBasis,
            'line6_yearEndFmv' => $this->line6_yearEndFmv,
            'line7_distributionsNotConverted' => $this->line7_distributionsNotConverted,
            'line8_convertedToRoth' => $this->line8_convertedToRoth,
            'line9_total' => $this->line9_total,
            'line10_proRataRatio' => $this->line10_proRataRatio,
            'line11_basisInConversion' => $this->line11_basisInConversion,
            'line12_basisInDistributions' => $this->line12_basisInDistributions,
            'line13_totalBasisUsed' => $this->line13_totalBasisUsed,
            'line14_basisCarriedForward' => $this->line14_basisCarriedForward,
            'line15c_taxableDistributions' => $this->line15c_taxableDistributions,
            'line18_taxableConversions' => $this->line18_taxableConversions,
            'taxableToForm1040Line4b' => $this->taxableToForm1040Line4b,
            'conversions' => array_map(static fn (Form8606SourceRowFact $row): array => $row->toArray(), $this->conversions),
            'distributions' => array_map(static fn (Form8606SourceRowFact $row): array => $row->toArray(), $this->distributions),
            'hasActivity' => $this->hasActivity,
        ];
    }
}
