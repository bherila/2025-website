<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuVestSettlement;
use Illuminate\Support\Carbon;

class RsuTransactionMatcher
{
    /** @return array{transactions: array<int, array<string, mixed>>, payslips: array<int, array<string, mixed>>} */
    public function candidates(FinRsuVestSettlement $settlement): array
    {
        return [
            'transactions' => $this->transactionCandidates($settlement),
            'payslips' => $this->payslipCandidates($settlement),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function transactionCandidates(FinRsuVestSettlement $settlement): array
    {
        return FinAccountLineItems::query()
            ->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', $settlement->uid))
            ->whereDate('t_date', '>=', Carbon::parse($settlement->vest_date)->subDays(7)->format('Y-m-d'))
            ->whereDate('t_date', '<=', Carbon::parse($settlement->vest_date)->addDays(14)->format('Y-m-d'))
            ->where(function ($query) use ($settlement): void {
                $query->where('t_symbol', $settlement->symbol)
                    ->orWhere('t_description', 'like', '%'.$settlement->symbol.'%');
            })
            ->limit(20)
            ->get()
            ->map(fn (FinAccountLineItems $transaction): array => [
                'id' => $transaction->t_id,
                'date' => $transaction->t_date,
                'symbol' => $transaction->t_symbol,
                'quantity' => $transaction->t_qty,
                'price' => $transaction->t_price,
                'amount' => $transaction->t_amt,
                'description' => $transaction->t_description,
                'confidence' => $this->transactionConfidence($settlement, $transaction),
            ])->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function payslipCandidates(FinRsuVestSettlement $settlement): array
    {
        return FinPayslips::query()
            ->where('uid', $settlement->uid)
            ->whereDate('pay_date', '>=', Carbon::parse($settlement->vest_date)->subDays(14)->format('Y-m-d'))
            ->whereDate('pay_date', '<=', Carbon::parse($settlement->vest_date)->addDays(45)->format('Y-m-d'))
            ->where(function ($query): void {
                $query->where('earnings_rsu', '>', 0)
                    ->orWhere('ps_rsu_tax_offset', '>', 0)
                    ->orWhere('ps_rsu_excess_refund', '>', 0);
            })
            ->limit(20)
            ->get()
            ->map(fn (FinPayslips $payslip): array => [
                'id' => $payslip->payslip_id,
                'pay_date' => $payslip->pay_date,
                'earnings_rsu' => $payslip->earnings_rsu,
                'ps_rsu_tax_offset' => $payslip->ps_rsu_tax_offset,
                'ps_rsu_excess_refund' => $payslip->ps_rsu_excess_refund,
                'confidence' => 0.7500,
            ])->all();
    }

    private function transactionConfidence(FinRsuVestSettlement $settlement, FinAccountLineItems $transaction): float
    {
        $confidence = 0.25;
        if (strtoupper((string) $transaction->t_symbol) === $settlement->symbol) {
            $confidence += 0.35;
        }
        if ($transaction->t_price !== null && $settlement->vest_price !== null && abs((float) $transaction->t_price - (float) $settlement->vest_price) < 0.01) {
            $confidence += 0.25;
        }

        return min(1.0, $confidence);
    }
}
