<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form4797Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $partISources;

    /**
     * @var TaxFactSource[]
     */
    public array $partIISources;

    /**
     * @var TaxFactSource[]
     */
    public array $partIIISources;

    /**
     * @var TaxFactSource[]
     */
    public array $schedule1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $scheduleDSources;

    /**
     * @param  TaxFactSource[]  $partISources
     * @param  TaxFactSource[]  $partIISources
     * @param  TaxFactSource[]  $partIIISources
     * @param  TaxFactSource[]  $schedule1Sources
     * @param  TaxFactSource[]  $scheduleDSources
     */
    public function __construct(
        array $partISources,
        public float $partINet1231,
        array $partIISources,
        public float $partIIOrdinary,
        array $partIIISources,
        public float $partIIIRecapture,
        public float $netToSchedule1Line4,
        public float $netToScheduleDLongTerm,
        public bool $hasActivity,
        array $schedule1Sources,
        array $scheduleDSources,
    ) {
        $this->partISources = $partISources;
        $this->partIISources = $partIISources;
        $this->partIIISources = $partIIISources;
        $this->schedule1Sources = $schedule1Sources;
        $this->scheduleDSources = $scheduleDSources;
    }

    public static function empty(): self
    {
        return new self(
            partISources: [],
            partINet1231: 0.0,
            partIISources: [],
            partIIOrdinary: 0.0,
            partIIISources: [],
            partIIIRecapture: 0.0,
            netToSchedule1Line4: 0.0,
            netToScheduleDLongTerm: 0.0,
            hasActivity: false,
            schedule1Sources: [],
            scheduleDSources: [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'partISources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->partISources),
            'partINet1231' => $this->partINet1231,
            'partIISources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->partIISources),
            'partIIOrdinary' => $this->partIIOrdinary,
            'partIIISources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->partIIISources),
            'partIIIRecapture' => $this->partIIIRecapture,
            'netToSchedule1Line4' => $this->netToSchedule1Line4,
            'netToScheduleDLongTerm' => $this->netToScheduleDLongTerm,
            'hasActivity' => $this->hasActivity,
            'schedule1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->schedule1Sources),
            'scheduleDSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->scheduleDSources),
        ];
    }
}
