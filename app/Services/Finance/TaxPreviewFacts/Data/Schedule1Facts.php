<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Schedule1Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $line3Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line5Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8zSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8hSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8iSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line15Sources;

    /**
     * @param  TaxFactSource[]  $line3Sources
     * @param  TaxFactSource[]  $line5Sources
     * @param  TaxFactSource[]  $line8Sources
     * @param  TaxFactSource[]  $line8bSources
     * @param  TaxFactSource[]  $line8hSources
     * @param  TaxFactSource[]  $line8iSources
     * @param  TaxFactSource[]  $line8zSources
     * @param  TaxFactSource[]  $line15Sources
     */
    public function __construct(
        array $line3Sources,
        public float $line3Total,
        array $line5Sources,
        public float $line5Total,
        array $line8Sources,
        array $line8bSources,
        public float $line8bTotal,
        array $line8hSources,
        public float $line8hTotal,
        array $line8iSources,
        public float $line8iTotal,
        array $line8zSources,
        public float $line8zTotal,
        public float $line9TotalOtherIncome,
        array $line15Sources,
        public float $line15Total,
    ) {
        $this->line3Sources = $line3Sources;
        $this->line5Sources = $line5Sources;
        $this->line8Sources = $line8Sources;
        $this->line8bSources = $line8bSources;
        $this->line8hSources = $line8hSources;
        $this->line8iSources = $line8iSources;
        $this->line8zSources = $line8zSources;
        $this->line15Sources = $line15Sources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'line3Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line3Sources),
            'line3Total' => $this->line3Total,
            'line5Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line5Sources),
            'line5Total' => $this->line5Total,
            'line8Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8Sources),
            'line8bSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8bSources),
            'line8bTotal' => $this->line8bTotal,
            'line8hSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8hSources),
            'line8hTotal' => $this->line8hTotal,
            'line8iSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8iSources),
            'line8iTotal' => $this->line8iTotal,
            'line8zSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line8zSources),
            'line8zTotal' => $this->line8zTotal,
            'line9TotalOtherIncome' => $this->line9TotalOtherIncome,
            'line15Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line15Sources),
            'line15Total' => $this->line15Total,
        ];
    }
}
