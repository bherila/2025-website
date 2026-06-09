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
    private const array BOX_TO_SCHEDULE_D_LINE = [
        'A' => '1b',
        'B' => '2',
        'C' => '3',
        'D' => '8b',
        'E' => '9',
        'F' => '10',
    ];

    private const array SHORT_TERM_BOXES = ['A', 'B', 'C'];

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
        $rollups = $this->rollupsWithPartnershipRows($rollups, $partnershipRows);
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

    /**
     * @param  ScheduleDRollupFact[]  $baseRollups
     * @param  Form8949RowFact[]  $partnershipRows
     * @return ScheduleDRollupFact[]
     */
    private function rollupsWithPartnershipRows(array $baseRollups, array $partnershipRows): array
    {
        /** @var array<string, array{form8949Box:string,isShortTerm:bool,scheduleDLine:string,totalProceeds:float,totalCostBasis:float,totalAdjustment:float,netGainOrLoss:float,rowCount:int}> $buckets */
        $buckets = [];

        foreach ($baseRollups as $rollup) {
            $key = $this->rollupKey($rollup->form8949Box, $rollup->scheduleDLine);
            $buckets[$key] = [
                'form8949Box' => $rollup->form8949Box,
                'isShortTerm' => $rollup->isShortTerm,
                'scheduleDLine' => $rollup->scheduleDLine,
                'totalProceeds' => $rollup->totalProceeds,
                'totalCostBasis' => $rollup->totalCostBasis,
                'totalAdjustment' => $rollup->totalAdjustment,
                'netGainOrLoss' => $rollup->netGainOrLoss,
                'rowCount' => $rollup->rowCount,
            ];
        }

        foreach ($partnershipRows as $row) {
            $box = $row->form8949Box;
            if ($box === null || ! isset(self::BOX_TO_SCHEDULE_D_LINE[$box])) {
                continue;
            }

            $scheduleDLine = self::BOX_TO_SCHEDULE_D_LINE[$box];
            $key = $this->rollupKey($box, $scheduleDLine);
            if (! isset($buckets[$key])) {
                $buckets[$key] = [
                    'form8949Box' => $box,
                    'isShortTerm' => in_array($box, self::SHORT_TERM_BOXES, true),
                    'scheduleDLine' => $scheduleDLine,
                    'totalProceeds' => 0.0,
                    'totalCostBasis' => 0.0,
                    'totalAdjustment' => 0.0,
                    'netGainOrLoss' => 0.0,
                    'rowCount' => 0,
                ];
            }

            $buckets[$key]['totalProceeds'] = $this->sumMoney([$buckets[$key]['totalProceeds'], $row->proceeds]);
            $buckets[$key]['totalCostBasis'] = $this->sumMoney([$buckets[$key]['totalCostBasis'], $row->costBasis]);
            $buckets[$key]['totalAdjustment'] = $this->sumMoney([$buckets[$key]['totalAdjustment'], $row->adjustmentAmount]);
            $buckets[$key]['netGainOrLoss'] = $this->sumMoney([$buckets[$key]['netGainOrLoss'], $row->gainOrLoss]);
            $buckets[$key]['rowCount']++;
        }

        ksort($buckets);

        $rollups = [];
        foreach (array_values($buckets) as $bucket) {
            $rollups[] = new ScheduleDRollupFact(
                form8949Box: $bucket['form8949Box'],
                isShortTerm: $bucket['isShortTerm'],
                scheduleDLine: $bucket['scheduleDLine'],
                totalProceeds: $bucket['totalProceeds'],
                totalCostBasis: $bucket['totalCostBasis'],
                totalAdjustment: $bucket['totalAdjustment'],
                netGainOrLoss: $bucket['netGainOrLoss'],
                rowCount: $bucket['rowCount'],
            );
        }

        return $rollups;
    }

    private function rollupKey(string $box, string $scheduleDLine): string
    {
        return "{$box}|{$scheduleDLine}";
    }
}
