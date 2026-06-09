<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinRsuVestSettlement;

class RsuTaxProjectionService
{
    /** @return array<string, mixed> */
    public function facts(int $userId, int $year): array
    {
        $settlements = FinRsuVestSettlement::query()
            ->where('uid', $userId)
            ->whereYear('vest_date', $year)
            ->whereNotIn('status', ['ignored'])
            ->with('allocations')
            ->get();

        $ordinaryIncome = (float) $settlements->sum(fn (FinRsuVestSettlement $settlement): float => (float) $settlement->gross_income);
        $withholdingValue = (float) $settlements->sum(fn (FinRsuVestSettlement $settlement): float => (float) ($settlement->withheld_value ?? 0));
        $actualTaxRemitted = (float) $settlements->sum(fn (FinRsuVestSettlement $settlement): float => (float) ($settlement->actual_tax_remitted ?? 0));
        $excessRefund = (float) $settlements->sum(fn (FinRsuVestSettlement $settlement): float => (float) ($settlement->excess_refund ?? 0));

        return [
            'year' => $year,
            'ordinaryIncomeAtVest' => round($ordinaryIncome, 4),
            'withholdingValue' => round($withholdingValue, 4),
            'actualTaxRemitted' => round($actualTaxRemitted, 4),
            'excessRefund' => round($excessRefund, 4),
            'unreconciledAmount' => round($withholdingValue - $actualTaxRemitted - $excessRefund, 4),
            'events' => $settlements->values()->all(),
            'sources' => ['fin_rsu_vest_settlements'],
        ];
    }
}
