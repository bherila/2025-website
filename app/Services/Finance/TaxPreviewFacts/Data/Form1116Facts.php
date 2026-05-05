<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form1116Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $passiveIncomeSources;

    /**
     * @var TaxFactSource[]
     */
    public array $generalIncomeSources;

    /**
     * @var TaxFactSource[]
     */
    public array $foreignTaxSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line4bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $sourcedByPartnerElectionSources;

    /**
     * @param  TaxFactSource[]  $passiveIncomeSources
     * @param  TaxFactSource[]  $generalIncomeSources
     * @param  TaxFactSource[]  $foreignTaxSources
     * @param  TaxFactSource[]  $line4bSources
     * @param  TaxFactSource[]  $sourcedByPartnerElectionSources
     */
    public function __construct(
        array $passiveIncomeSources,
        public float $totalPassiveIncome,
        array $generalIncomeSources,
        public float $totalGeneralIncome,
        array $foreignTaxSources,
        public float $totalForeignTaxes,
        array $line4bSources,
        public float $totalLine4b,
        array $sourcedByPartnerElectionSources,
        public float $totalSourcedByPartnerIncome,
        public float $creditValue,
        public float $deductionValueAtThirtySevenPercent,
        public ?string $recommendation,
        public float $totalK1Box5,
        public bool $turboTaxAlert,
    ) {
        $this->passiveIncomeSources = $passiveIncomeSources;
        $this->generalIncomeSources = $generalIncomeSources;
        $this->foreignTaxSources = $foreignTaxSources;
        $this->line4bSources = $line4bSources;
        $this->sourcedByPartnerElectionSources = $sourcedByPartnerElectionSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'passiveIncomeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->passiveIncomeSources),
            'totalPassiveIncome' => $this->totalPassiveIncome,
            'generalIncomeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->generalIncomeSources),
            'totalGeneralIncome' => $this->totalGeneralIncome,
            'foreignTaxSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->foreignTaxSources),
            'totalForeignTaxes' => $this->totalForeignTaxes,
            'line4bSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line4bSources),
            'totalLine4b' => $this->totalLine4b,
            'sourcedByPartnerElectionSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->sourcedByPartnerElectionSources),
            'totalSourcedByPartnerIncome' => $this->totalSourcedByPartnerIncome,
            'creditValue' => $this->creditValue,
            'deductionValueAtThirtySevenPercent' => $this->deductionValueAtThirtySevenPercent,
            'recommendation' => $this->recommendation,
            'totalK1Box5' => $this->totalK1Box5,
            'turboTaxAlert' => $this->turboTaxAlert,
        ];
    }
}
