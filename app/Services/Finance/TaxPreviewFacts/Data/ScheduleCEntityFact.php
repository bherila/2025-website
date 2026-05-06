<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleCEntityFact
{
    /**
     * @var TaxFactSource[]
     */
    public array $grossReceiptSources;

    /**
     * @var TaxFactSource[]
     */
    public array $expenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $homeOfficeSources;

    /**
     * @param  TaxFactSource[]  $grossReceiptSources
     * @param  TaxFactSource[]  $expenseSources
     * @param  TaxFactSource[]  $homeOfficeSources
     */
    public function __construct(
        public ?int $entityId,
        public string $entityName,
        array $grossReceiptSources,
        public float $grossReceipts,
        array $expenseSources,
        public float $expenses,
        array $homeOfficeSources,
        public float $homeOfficeClaimed,
        public float $homeOfficeAllowable,
        public float $homeOfficeDisallowed,
        public float $homeOfficePriorCarryforward,
        public string $homeOfficeLimitationReason,
        public float $netProfitBeforeHomeOffice,
        public float $netProfit,
    ) {
        $this->grossReceiptSources = $grossReceiptSources;
        $this->expenseSources = $expenseSources;
        $this->homeOfficeSources = $homeOfficeSources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'entityId' => $this->entityId,
            'entityName' => $this->entityName,
            'grossReceiptSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->grossReceiptSources),
            'grossReceipts' => $this->grossReceipts,
            'expenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->expenseSources),
            'expenses' => $this->expenses,
            'homeOfficeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->homeOfficeSources),
            'homeOfficeClaimed' => $this->homeOfficeClaimed,
            'homeOfficeAllowable' => $this->homeOfficeAllowable,
            'homeOfficeDisallowed' => $this->homeOfficeDisallowed,
            'homeOfficePriorCarryforward' => $this->homeOfficePriorCarryforward,
            'homeOfficeLimitationReason' => $this->homeOfficeLimitationReason,
            'netProfitBeforeHomeOffice' => $this->netProfitBeforeHomeOffice,
            'netProfit' => $this->netProfit,
        ];
    }
}
