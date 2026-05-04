<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8949Facts
{
    /**
     * @var Form8949RowFact[]
     */
    public array $rows;

    /**
     * @var ScheduleDRollupFact[]
     */
    public array $scheduleDRollups;

    /**
     * @var WashSaleAdjustmentFact[]
     */
    public array $washSaleAdjustments;

    /**
     * @param  Form8949RowFact[]  $rows
     * @param  ScheduleDRollupFact[]  $scheduleDRollups
     * @param  WashSaleAdjustmentFact[]  $washSaleAdjustments
     */
    public function __construct(
        public string $reportingMode,
        array $rows,
        array $scheduleDRollups,
        array $washSaleAdjustments,
        public int $rowCount,
        public int $washSaleAdjustmentCount,
        public float $washSaleAdjustmentTotal,
    ) {
        $this->rows = $rows;
        $this->scheduleDRollups = $scheduleDRollups;
        $this->washSaleAdjustments = $washSaleAdjustments;
    }

    /**
     * @return array{reportingMode:string,rows:array<int,array<string,mixed>>,scheduleDRollups:array<int,array<string,mixed>>,washSaleAdjustments:array<int,array<string,mixed>>,rowCount:int,washSaleAdjustmentCount:int,washSaleAdjustmentTotal:float}
     */
    public function toArray(): array
    {
        return [
            'reportingMode' => $this->reportingMode,
            'rows' => array_map(static fn (Form8949RowFact $row): array => $row->toArray(), $this->rows),
            'scheduleDRollups' => array_map(static fn (ScheduleDRollupFact $rollup): array => $rollup->toArray(), $this->scheduleDRollups),
            'washSaleAdjustments' => array_map(static fn (WashSaleAdjustmentFact $adjustment): array => $adjustment->toArray(), $this->washSaleAdjustments),
            'rowCount' => $this->rowCount,
            'washSaleAdjustmentCount' => $this->washSaleAdjustmentCount,
            'washSaleAdjustmentTotal' => $this->washSaleAdjustmentTotal,
        ];
    }
}
