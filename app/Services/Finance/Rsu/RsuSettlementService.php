<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\FinanceTool\FinRsuVestSettlementAllocation;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class RsuSettlementService
{
    /** @return array<int, array<string, mixed>> */
    public function suggest(int $userId): array
    {
        $settledKeys = FinRsuVestSettlement::query()
            ->where('uid', $userId)
            ->whereNotIn('status', ['ignored'])
            ->get()
            ->mapWithKeys(fn (FinRsuVestSettlement $settlement): array => [(string) $settlement->vest_date.'|'.$settlement->symbol => true]);

        return FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereNotNull('vest_price')
            ->orderBy('vest_date')
            ->get()
            ->groupBy(fn (FinEquityAwards $award): string => (string) $award->vest_date.'|'.$award->symbol)
            ->reject(fn (Collection $group, string $key): bool => isset($settledKeys[$key]))
            ->map(fn (Collection $group): array => $this->suggestionFromAwards($group))
            ->values()
            ->all();
    }

    /** @param array<string, mixed> $data */
    public function confirm(int $userId, string $vestDate, string $symbol, array $data): FinRsuVestSettlement
    {
        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $vestDate)
            ->where('symbol', strtoupper($symbol))
            ->whereNotNull('vest_price')
            ->get();

        return DB::transaction(function () use ($userId, $vestDate, $symbol, $data, $awards): FinRsuVestSettlement {
            $summary = $this->summary($awards);
            $withheldShares = $this->nullableFloat($data['withheldSharesWhole'] ?? $data['withheld_shares_whole'] ?? null);
            $actualTaxRemitted = $this->nullableFloat($data['actualTaxRemitted'] ?? $data['actual_tax_remitted'] ?? null);
            $withheldValue = $withheldShares === null || $summary['vestPrice'] === null ? null : round($withheldShares * $summary['vestPrice'], 4);
            $excessRefund = $withheldValue === null || $actualTaxRemitted === null ? null : round($withheldValue - $actualTaxRemitted, 4);

            $settlement = isset($data['settlement_id'])
                ? FinRsuVestSettlement::query()->where('uid', $userId)->findOrFail($data['settlement_id'])
                : FinRsuVestSettlement::query()->firstOrNew([
                    'uid' => $userId,
                    'vest_date' => $vestDate,
                    'symbol' => strtoupper($symbol),
                ]);

            $settlement->fill([
                'vest_price' => $summary['vestPrice'],
                'vest_price_source' => $summary['vestPriceSource'],
                'gross_shares' => $summary['grossShares'],
                'gross_income' => $summary['grossIncome'],
                'withheld_shares_whole' => $withheldShares,
                'withheld_value' => $withheldValue,
                'actual_tax_remitted' => $actualTaxRemitted,
                'excess_refund' => $excessRefund,
                'brokerage_account_id' => $data['brokerageAccountId'] ?? $data['brokerage_account_id'] ?? null,
                'payslip_id' => $data['payslipId'] ?? $data['payslip_id'] ?? null,
                'refund_payslip_id' => $data['refundPayslipId'] ?? $data['refund_payslip_id'] ?? null,
                'status' => 'confirmed',
                'notes' => $data['notes'] ?? null,
            ]);
            $settlement->save();

            $this->replaceAllocations($settlement, $awards, $withheldShares, $withheldValue, $actualTaxRemitted, $excessRefund);

            return $settlement->load('allocations');
        });
    }

    public function ignore(FinRsuVestSettlement $settlement): FinRsuVestSettlement
    {
        $settlement->status = 'ignored';
        $settlement->save();

        return $settlement;
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return array<string, mixed>
     */
    private function suggestionFromAwards(Collection $awards): array
    {
        $summary = $this->summary($awards);
        /** @var FinEquityAwards $first */
        $first = $awards->first();

        return [
            'vestDate' => (string) $first->vest_date,
            'symbol' => $first->symbol,
            'grossShares' => $summary['grossShares'],
            'vestPrice' => $summary['vestPrice'],
            'grossIncome' => $summary['grossIncome'],
            'awardRows' => $awards->values()->all(),
            'suggestedWithheldShares' => null,
        ];
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return array{grossShares: float, vestPrice: ?float, vestPriceSource: ?string, grossIncome: float}
     */
    private function summary(Collection $awards): array
    {
        $grossShares = (float) $awards->sum(fn (FinEquityAwards $award): float => (float) $award->share_count);
        $grossIncome = (float) $awards->sum(fn (FinEquityAwards $award): float => (float) $award->share_count * (float) $award->vest_price);
        $vestPrice = $grossShares === 0.0 ? null : round($grossIncome / $grossShares, 6);
        /** @var FinEquityAwards|null $first */
        $first = $awards->first();

        return ['grossShares' => $grossShares, 'vestPrice' => $vestPrice, 'vestPriceSource' => $first?->vest_price_source, 'grossIncome' => round($grossIncome, 4)];
    }

    /** @param Collection<int, FinEquityAwards> $awards */
    private function replaceAllocations(FinRsuVestSettlement $settlement, Collection $awards, ?float $withheldShares, ?float $withheldValue, ?float $actualTaxRemitted, ?float $excessRefund): void
    {
        $settlement->allocations()->delete();
        $grossShares = (float) $settlement->gross_shares;

        foreach ($awards as $award) {
            $ratio = $grossShares === 0.0 ? 0.0 : (float) $award->share_count / $grossShares;
            FinRsuVestSettlementAllocation::query()->create([
                'settlement_id' => $settlement->id,
                'equity_award_id' => $award->id,
                'vested_shares' => $award->share_count,
                'gross_income' => round((float) $award->share_count * (float) $award->vest_price, 4),
                'allocation_ratio' => round($ratio, 10),
                'allocated_withheld_shares' => $withheldShares === null ? null : round($withheldShares * $ratio, 6),
                'allocated_withheld_value' => $withheldValue === null ? null : round($withheldValue * $ratio, 4),
                'allocated_tax_remitted' => $actualTaxRemitted === null ? null : round($actualTaxRemitted * $ratio, 4),
                'allocated_excess_refund' => $excessRefund === null ? null : round($excessRefund * $ratio, 4),
            ]);
        }
    }

    private function nullableFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value;
    }
}
