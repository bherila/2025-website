<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleEFacts
{
    /**
     * @var TaxFactSource[]
     */
    public array $miscIncomeSources;

    /**
     * @var TaxFactSource[]
     */
    public array $box1Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $box2Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $box3Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $box4Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $box11ZZSources;

    /**
     * @var TaxFactSource[]
     */
    public array $box13ZZSources;

    /**
     * @var TaxFactSource[]
     */
    public array $traderNiiSources;

    /**
     * @param  TaxFactSource[]  $miscIncomeSources
     * @param  TaxFactSource[]  $box1Sources
     * @param  TaxFactSource[]  $box2Sources
     * @param  TaxFactSource[]  $box3Sources
     * @param  TaxFactSource[]  $box4Sources
     * @param  TaxFactSource[]  $box11ZZSources
     * @param  TaxFactSource[]  $box13ZZSources
     * @param  TaxFactSource[]  $traderNiiSources
     */
    public function __construct(
        array $miscIncomeSources,
        public float $miscIncomeTotal,
        array $box1Sources,
        public float $totalBox1,
        array $box2Sources,
        public float $totalBox2,
        array $box3Sources,
        public float $totalBox3,
        array $box4Sources,
        public float $totalBox4,
        public float $totalBox5,
        array $box11ZZSources,
        public float $totalBox11ZZ,
        array $box13ZZSources,
        public float $totalBox13ZZ,
        array $traderNiiSources,
        public float $totalTraderNii,
        public float $totalPassive,
        public float $totalNonpassive,
        public float $totalNonpassiveIncome,
        public float $totalNonpassiveLoss,
        public float $grandTotal,
    ) {
        $this->miscIncomeSources = $miscIncomeSources;
        $this->box1Sources = $box1Sources;
        $this->box2Sources = $box2Sources;
        $this->box3Sources = $box3Sources;
        $this->box4Sources = $box4Sources;
        $this->box11ZZSources = $box11ZZSources;
        $this->box13ZZSources = $box13ZZSources;
        $this->traderNiiSources = $traderNiiSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'miscIncomeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->miscIncomeSources),
            'miscIncomeTotal' => $this->miscIncomeTotal,
            'box1Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box1Sources),
            'totalBox1' => $this->totalBox1,
            'box2Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box2Sources),
            'totalBox2' => $this->totalBox2,
            'box3Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box3Sources),
            'totalBox3' => $this->totalBox3,
            'box4Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box4Sources),
            'totalBox4' => $this->totalBox4,
            'totalBox5' => $this->totalBox5,
            'box11ZZSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box11ZZSources),
            'totalBox11ZZ' => $this->totalBox11ZZ,
            'box13ZZSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->box13ZZSources),
            'totalBox13ZZ' => $this->totalBox13ZZ,
            'traderNiiSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->traderNiiSources),
            'totalTraderNii' => $this->totalTraderNii,
            'totalPassive' => $this->totalPassive,
            'totalNonpassive' => $this->totalNonpassive,
            'totalNonpassiveIncome' => $this->totalNonpassiveIncome,
            'totalNonpassiveLoss' => $this->totalNonpassiveLoss,
            'grandTotal' => $this->grandTotal,
        ];
    }
}
