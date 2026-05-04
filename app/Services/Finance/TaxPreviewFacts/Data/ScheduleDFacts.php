<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleDFacts
{
    /**
     * @var ScheduleDRollupFact[]
     */
    public array $form8949Rollups;

    /**
     * @var TaxFactSource[]
     */
    public array $line5Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line3Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line10Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line12Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line13Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $ambiguous11SSources;

    /**
     * @param  ScheduleDRollupFact[]  $form8949Rollups
     * @param  TaxFactSource[]  $line3Sources
     * @param  TaxFactSource[]  $line5Sources
     * @param  TaxFactSource[]  $line10Sources
     * @param  TaxFactSource[]  $line12Sources
     * @param  TaxFactSource[]  $line13Sources
     * @param  TaxFactSource[]  $ambiguous11SSources
     */
    public function __construct(
        array $form8949Rollups,
        public float $line1aGainLoss,
        public float $line1bGainLoss,
        public float $line2GainLoss,
        array $line3Sources,
        public float $line3GainLoss,
        public float $line4GainLoss,
        array $line5Sources,
        public float $line5GainLoss,
        public float $line6Carryover,
        public float $line7NetShortTerm,
        public float $line8aGainLoss,
        public float $line8bGainLoss,
        public float $line9GainLoss,
        array $line10Sources,
        public float $line10GainLoss,
        public float $line11GainLoss,
        array $line12Sources,
        public float $line12GainLoss,
        array $line13Sources,
        public float $line13CapitalGainDistributions,
        public float $line14Carryover,
        public float $line15NetLongTerm,
        public float $line16Combined,
        public float $line21LimitedLossOrGain,
        public float $appliedToReturn,
        public float $carryforward,
        public float $totalBusinessCapGains,
        public float $totalPersonalCapGains,
        public float $limitedBusinessCapGains,
        public float $limitedPersonalCapGains,
        array $ambiguous11SSources,
        public float $ambiguous11SAmount,
    ) {
        $this->form8949Rollups = $form8949Rollups;
        $this->line3Sources = $line3Sources;
        $this->line5Sources = $line5Sources;
        $this->line10Sources = $line10Sources;
        $this->line12Sources = $line12Sources;
        $this->line13Sources = $line13Sources;
        $this->ambiguous11SSources = $ambiguous11SSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'form8949Rollups' => array_map(static fn (ScheduleDRollupFact $rollup): array => $rollup->toArray(), $this->form8949Rollups),
            'line1aGainLoss' => $this->line1aGainLoss,
            'line1bGainLoss' => $this->line1bGainLoss,
            'line2GainLoss' => $this->line2GainLoss,
            'line3Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line3Sources),
            'line3GainLoss' => $this->line3GainLoss,
            'line4GainLoss' => $this->line4GainLoss,
            'line5Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line5Sources),
            'line5GainLoss' => $this->line5GainLoss,
            'line6Carryover' => $this->line6Carryover,
            'line7NetShortTerm' => $this->line7NetShortTerm,
            'line8aGainLoss' => $this->line8aGainLoss,
            'line8bGainLoss' => $this->line8bGainLoss,
            'line9GainLoss' => $this->line9GainLoss,
            'line10Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line10Sources),
            'line10GainLoss' => $this->line10GainLoss,
            'line11GainLoss' => $this->line11GainLoss,
            'line12Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line12Sources),
            'line12GainLoss' => $this->line12GainLoss,
            'line13Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line13Sources),
            'line13CapitalGainDistributions' => $this->line13CapitalGainDistributions,
            'line14Carryover' => $this->line14Carryover,
            'line15NetLongTerm' => $this->line15NetLongTerm,
            'line16Combined' => $this->line16Combined,
            'line21LimitedLossOrGain' => $this->line21LimitedLossOrGain,
            'appliedToReturn' => $this->appliedToReturn,
            'carryforward' => $this->carryforward,
            'totalBusinessCapGains' => $this->totalBusinessCapGains,
            'totalPersonalCapGains' => $this->totalPersonalCapGains,
            'limitedBusinessCapGains' => $this->limitedBusinessCapGains,
            'limitedPersonalCapGains' => $this->limitedPersonalCapGains,
            'ambiguous11SSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->ambiguous11SSources),
            'ambiguous11SAmount' => $this->ambiguous11SAmount,
        ];
    }
}
