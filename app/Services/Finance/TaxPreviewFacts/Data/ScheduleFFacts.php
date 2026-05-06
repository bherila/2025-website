<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleFFacts
{
    /**
     * @var TaxFactSource[]
     */
    public array $grossIncomeSources;

    /**
     * @var TaxFactSource[]
     */
    public array $expenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line34Sources;

    /**
     * @param  TaxFactSource[]  $grossIncomeSources
     * @param  TaxFactSource[]  $expenseSources
     * @param  TaxFactSource[]  $line34Sources
     */
    public function __construct(
        array $grossIncomeSources,
        public float $grossFarmIncome,
        array $expenseSources,
        public float $totalFarmExpenses,
        public float $netFarmProfit,
        public bool $hasActivity,
        array $line34Sources,
    ) {
        $this->grossIncomeSources = $grossIncomeSources;
        $this->expenseSources = $expenseSources;
        $this->line34Sources = $line34Sources;
    }

    public static function empty(): self
    {
        return new self(
            grossIncomeSources: [],
            grossFarmIncome: 0.0,
            expenseSources: [],
            totalFarmExpenses: 0.0,
            netFarmProfit: 0.0,
            hasActivity: false,
            line34Sources: [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'grossIncomeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->grossIncomeSources),
            'grossFarmIncome' => $this->grossFarmIncome,
            'expenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->expenseSources),
            'totalFarmExpenses' => $this->totalFarmExpenses,
            'netFarmProfit' => $this->netFarmProfit,
            'hasActivity' => $this->hasActivity,
            'line34Sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->line34Sources),
        ];
    }
}
