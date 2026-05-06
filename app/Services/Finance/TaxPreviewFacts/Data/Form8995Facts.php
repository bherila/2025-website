<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8995Facts
{
    /**
     * @var Form8995EntityFact[]
     */
    public array $entities;

    /**
     * @var TaxFactSource[]
     */
    public array $line1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line6Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $reviewSources;

    /**
     * @param  Form8995EntityFact[]  $entities
     * @param  TaxFactSource[]  $line1Sources
     * @param  TaxFactSource[]  $line6Sources
     * @param  TaxFactSource[]  $reviewSources
     */
    public function __construct(
        array $entities,
        array $line1Sources,
        public float $totalQbi,
        public float $totalQbiComponent,
        array $line6Sources,
        public float $qualifiedReitDividends,
        public float $qualifiedPtpIncome,
        public float $reitPtpComponent,
        public float $taxableIncomeBeforeQbi,
        public float $netCapitalGain,
        public float $taxableIncomeLessNetCapitalGain,
        public float $taxableIncomeCap,
        public float $deduction,
        public float $thresholdSingle,
        public float $thresholdMarriedFilingJointly,
        public bool $aboveThreshold,
        array $reviewSources,
    ) {
        $this->entities = $entities;
        $this->line1Sources = $line1Sources;
        $this->line6Sources = $line6Sources;
        $this->reviewSources = $reviewSources;
    }

    public static function empty(int $year): self
    {
        $thresholds = self::thresholds($year);

        return new self(
            entities: [],
            line1Sources: [],
            totalQbi: 0.0,
            totalQbiComponent: 0.0,
            line6Sources: [],
            qualifiedReitDividends: 0.0,
            qualifiedPtpIncome: 0.0,
            reitPtpComponent: 0.0,
            taxableIncomeBeforeQbi: 0.0,
            netCapitalGain: 0.0,
            taxableIncomeLessNetCapitalGain: 0.0,
            taxableIncomeCap: 0.0,
            deduction: 0.0,
            thresholdSingle: $thresholds['single'],
            thresholdMarriedFilingJointly: $thresholds['mfj'],
            aboveThreshold: false,
            reviewSources: [],
        );
    }

    /**
     * Falls back to the latest known IRS threshold until a newer year is explicitly added.
     *
     * @return array{single: float, mfj: float}
     */
    public static function thresholds(int $year): array
    {
        $thresholds = [
            2018 => ['single' => 157500.0, 'mfj' => 315000.0],
            2019 => ['single' => 160700.0, 'mfj' => 321400.0],
            2020 => ['single' => 163300.0, 'mfj' => 326600.0],
            2021 => ['single' => 164900.0, 'mfj' => 329800.0],
            2022 => ['single' => 170050.0, 'mfj' => 340100.0],
            2023 => ['single' => 182100.0, 'mfj' => 364200.0],
            2024 => ['single' => 191950.0, 'mfj' => 383900.0],
            2025 => ['single' => 197300.0, 'mfj' => 394600.0],
            2026 => ['single' => 201750.0, 'mfj' => 403500.0],
        ];

        return $thresholds[$year] ?? $thresholds[2026];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entities' => array_map(static fn (Form8995EntityFact $entity): array => $entity->toArray(), $this->entities),
            'line1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line1Sources),
            'totalQbi' => $this->totalQbi,
            'totalQbiComponent' => $this->totalQbiComponent,
            'line6Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line6Sources),
            'qualifiedReitDividends' => $this->qualifiedReitDividends,
            'qualifiedPtpIncome' => $this->qualifiedPtpIncome,
            'reitPtpComponent' => $this->reitPtpComponent,
            'taxableIncomeBeforeQbi' => $this->taxableIncomeBeforeQbi,
            'netCapitalGain' => $this->netCapitalGain,
            'taxableIncomeLessNetCapitalGain' => $this->taxableIncomeLessNetCapitalGain,
            'taxableIncomeCap' => $this->taxableIncomeCap,
            'deduction' => $this->deduction,
            'thresholdSingle' => $this->thresholdSingle,
            'thresholdMarriedFilingJointly' => $this->thresholdMarriedFilingJointly,
            'aboveThreshold' => $this->aboveThreshold,
            'reviewSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->reviewSources),
        ];
    }
}
