<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form6781Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $shortTermSources;

    /**
     * @var TaxFactSource[]
     */
    public array $longTermSources;

    /**
     * @param  TaxFactSource[]  $shortTermSources
     * @param  TaxFactSource[]  $longTermSources
     */
    public function __construct(
        array $shortTermSources,
        array $longTermSources,
        public float $shortTermTotal,
        public float $longTermTotal,
        public float $netGain,
    ) {
        $this->shortTermSources = $shortTermSources;
        $this->longTermSources = $longTermSources;
    }

    public static function empty(): self
    {
        return new self(
            shortTermSources: [],
            longTermSources: [],
            shortTermTotal: 0.0,
            longTermTotal: 0.0,
            netGain: 0.0,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'shortTermSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->shortTermSources),
            'longTermSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->longTermSources),
            'shortTermTotal' => $this->shortTermTotal,
            'longTermTotal' => $this->longTermTotal,
            'netGain' => $this->netGain,
        ];
    }
}
