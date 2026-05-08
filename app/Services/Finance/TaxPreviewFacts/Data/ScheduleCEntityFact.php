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
    public array $returnsAndAllowancesSources;

    /**
     * @var TaxFactSource[]
     */
    public array $expenseSources;

    /**
     * @var TaxFactSource[]
     */
    public array $homeOfficeSources;

    /**
     * @var ScheduleCFlaggedExpenseRowFact[]
     */
    public array $flaggedExpenseRows;

    /**
     * @param  TaxFactSource[]  $grossReceiptSources
     * @param  TaxFactSource[]  $returnsAndAllowancesSources
     * @param  TaxFactSource[]  $expenseSources
     * @param  TaxFactSource[]  $homeOfficeSources
     * @param  ScheduleCFlaggedExpenseRowFact[]  $flaggedExpenseRows
     *
     * expensesBeforeHomeOffice intentionally mirrors expenses because Schedule C line 30 is separate from line 28.
     */
    public function __construct(
        public ?int $entityId,
        public string $entityName,
        array $grossReceiptSources,
        public float $grossReceipts,
        array $returnsAndAllowancesSources,
        public float $returnsAndAllowances,
        public float $grossIncomeAfterReturns,
        array $expenseSources,
        public float $expenses,
        public float $expensesBeforeHomeOffice,
        array $homeOfficeSources,
        public float $homeOfficeClaimed,
        public float $homeOfficeAllowable,
        public float $homeOfficeDisallowed,
        public float $homeOfficePriorCarryforward,
        public float $homeOfficeCarryoverToNextYear,
        public string $homeOfficeLimitationReason,
        public float $tentativeProfitBeforeHomeOffice,
        public float $netProfitBeforeHomeOffice,
        public float $netProfit,
        array $flaggedExpenseRows,
    ) {
        $this->grossReceiptSources = $grossReceiptSources;
        $this->returnsAndAllowancesSources = $returnsAndAllowancesSources;
        $this->expenseSources = $expenseSources;
        $this->homeOfficeSources = $homeOfficeSources;
        $this->flaggedExpenseRows = $flaggedExpenseRows;
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
            'returnsAndAllowancesSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->returnsAndAllowancesSources),
            'returnsAndAllowances' => $this->returnsAndAllowances,
            'grossIncomeAfterReturns' => $this->grossIncomeAfterReturns,
            'expenseSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->expenseSources),
            'expenses' => $this->expenses,
            'expensesBeforeHomeOffice' => $this->expensesBeforeHomeOffice,
            'homeOfficeSources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->homeOfficeSources),
            'homeOfficeClaimed' => $this->homeOfficeClaimed,
            'homeOfficeAllowable' => $this->homeOfficeAllowable,
            'homeOfficeDisallowed' => $this->homeOfficeDisallowed,
            'homeOfficePriorCarryforward' => $this->homeOfficePriorCarryforward,
            'homeOfficeCarryoverToNextYear' => $this->homeOfficeCarryoverToNextYear,
            'homeOfficeLimitationReason' => $this->homeOfficeLimitationReason,
            'tentativeProfitBeforeHomeOffice' => $this->tentativeProfitBeforeHomeOffice,
            'netProfitBeforeHomeOffice' => $this->netProfitBeforeHomeOffice,
            'netProfit' => $this->netProfit,
            'flaggedExpenseRows' => array_map(static fn (ScheduleCFlaggedExpenseRowFact $row): array => $row->toArray(), $this->flaggedExpenseRows),
        ];
    }
}
