<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\CapitalGains\Form8949ReportRow;
use App\Services\Finance\CapitalGains\ScheduleDRollupInput;
use App\Services\Finance\CapitalGains\WashSaleAdjustment;
use App\Services\Finance\TaxPreviewFacts\Data\Form8949Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Form8949RowFact;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleDRollupFact;
use App\Services\Finance\TaxPreviewFacts\Data\WashSaleAdjustmentFact;

class Form8949FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  array{taxYear:int,reportingMode:string,transactions:array<int,mixed>,adjustments:array<int,WashSaleAdjustment>,rows:array<int,Form8949ReportRow>,scheduleDRollup:array<int,ScheduleDRollupInput>}  $capitalGainsReport
     * @param  Form8949RowFact[]  $partnershipRows  Partnership §731 disposition rows (excess
     *                                              cash-distribution gains with a determinable
     *                                              holding period) appended to the broker rows.
     */
    public function build(array $capitalGainsReport, array $partnershipRows = []): Form8949Facts
    {
        $rows = array_map(
            static fn (Form8949ReportRow $row): Form8949RowFact => Form8949RowFact::fromReportRow($row),
            $capitalGainsReport['rows'],
        );
        $rows = [...$rows, ...$partnershipRows];
        $rollups = array_map(
            static fn (ScheduleDRollupInput $rollup): ScheduleDRollupFact => ScheduleDRollupFact::fromRollup($rollup),
            $capitalGainsReport['scheduleDRollup'],
        );
        $adjustments = array_map(
            static fn (WashSaleAdjustment $adjustment): WashSaleAdjustmentFact => WashSaleAdjustmentFact::fromAdjustment($adjustment),
            $capitalGainsReport['adjustments'],
        );

        $washSaleTotal = $this->sumMoney(array_map(
            static fn (WashSaleAdjustment $adjustment): float => $adjustment->disallowedLoss,
            $capitalGainsReport['adjustments'],
        ));

        return new Form8949Facts(
            reportingMode: $capitalGainsReport['reportingMode'],
            rows: $rows,
            scheduleDRollups: $rollups,
            washSaleAdjustments: $adjustments,
            rowCount: count($rows),
            washSaleAdjustmentCount: count($adjustments),
            washSaleAdjustmentTotal: $washSaleTotal,
        );
    }
}
