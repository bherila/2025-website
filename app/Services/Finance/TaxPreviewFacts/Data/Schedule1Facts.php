<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Schedule1Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $line5Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8zSources;

    /**
     * @param  TaxFactSource[]  $line5Sources
     * @param  TaxFactSource[]  $line8zSources
     */
    public function __construct(
        array $line5Sources,
        public float $line5Total,
        array $line8zSources,
        public float $line8zTotal,
        public float $line9TotalOtherIncome,
    ) {
        $this->line5Sources = $line5Sources;
        $this->line8zSources = $line8zSources;
    }

    /**
     * @return array{line5Sources:array<int,array<string,mixed>>,line5Total:float,line8zSources:array<int,array<string,mixed>>,line8zTotal:float,line9TotalOtherIncome:float}
     */
    public function toArray(): array
    {
        return [
            'line5Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line5Sources),
            'line5Total' => $this->line5Total,
            'line8zSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8zSources),
            'line8zTotal' => $this->line8zTotal,
            'line9TotalOtherIncome' => $this->line9TotalOtherIncome,
        ];
    }
}
