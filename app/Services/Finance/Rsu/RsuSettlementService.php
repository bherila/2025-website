<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEquityAwards;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinRsuVestSettlement;
use App\Models\FinanceTool\FinRsuVestSettlementAllocation;
use Closure;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class RsuSettlementService
{
    /** @return array<int, array<string, mixed>> */
    public function suggest(int $userId): array
    {
        return DB::transaction(function () use ($userId): array {
            return FinEquityAwards::query()
                ->where('uid', $userId)
                ->whereNotNull('vest_price')
                ->orderBy('vest_date')
                ->get()
                ->groupBy(fn (FinEquityAwards $award): string => (string) $award->vest_date.'|'.$award->symbol)
                ->map(fn (Collection $group): array => $this->persistSuggestion($userId, $group))
                ->filter(fn (array $suggestion): bool => $suggestion !== [])
                ->values()
                ->all();
        });
    }

    /** @param array<string, mixed> $data */
    public function confirm(int $userId, string $vestDate, string $symbol, array $data): FinRsuVestSettlement
    {
        $symbol = strtoupper($symbol);
        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $vestDate)
            ->where('symbol', $symbol)
            ->whereNotNull('vest_price')
            ->get();

        if ($awards->isEmpty()) {
            throw ValidationException::withMessages([
                'settlement' => 'No priced RSU vesting events exist for this vest date and symbol.',
            ]);
        }

        return DB::transaction(function () use ($userId, $vestDate, $symbol, $data, $awards): FinRsuVestSettlement {
            $summary = $this->summary($awards);
            $validated = $this->validateConfirmationData($userId, $data, $summary);
            $withheldShares = $validated['withheld_shares_whole'];
            $actualTaxRemitted = $validated['actual_tax_remitted'];
            $withheldValue = $withheldShares === null || $summary['vestPrice'] === null ? null : round($withheldShares * $summary['vestPrice'], 4);
            $excessRefund = $withheldValue === null || $actualTaxRemitted === null ? null : round($withheldValue - $actualTaxRemitted, 4);

            $settlement = isset($data['settlement_id'])
                ? FinRsuVestSettlement::query()->where('uid', $userId)->findOrFail($data['settlement_id'])
                : FinRsuVestSettlement::query()->firstOrNew([
                    'uid' => $userId,
                    'vest_date' => $vestDate,
                    'symbol' => $symbol,
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
                'brokerage_account_id' => $validated['brokerage_account_id'],
                'payslip_id' => $validated['payslip_id'],
                'refund_payslip_id' => $validated['refund_payslip_id'],
                'status' => 'confirmed',
                'notes' => $validated['notes'],
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

    public function reconcileAfterAwardDeletion(int $userId, int $settlementId): void
    {
        $settlement = FinRsuVestSettlement::query()
            ->where('uid', $userId)
            ->with('allocations')
            ->find($settlementId);

        if ($settlement === null || $settlement->status === 'ignored') {
            return;
        }

        if ($settlement->allocations->isNotEmpty()) {
            $this->reconcileAllocatedSettlement($settlement);

            return;
        }

        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $settlement->vest_date)
            ->where('symbol', $settlement->symbol)
            ->whereNotNull('vest_price')
            ->get();

        if ($awards->isEmpty()) {
            $settlement->delete();

            return;
        }

        $summary = $this->summary($awards);
        $settlement->fill([
            'vest_price' => $summary['vestPrice'],
            'gross_shares' => $summary['grossShares'],
            'gross_income' => $summary['grossIncome'],
        ]);
        $settlement->save();
    }

    /**
     * Re-reconcile any settlement affected by an award create/edit for the given
     * vest_date+symbol. Confirmed settlements (with allocations) have their gross
     * totals and per-award allocations recomputed from the current awards while
     * preserving allocation links; suggested settlements have their headline
     * totals refreshed. Empty settlements are removed.
     */
    public function reconcileAfterAwardChange(int $userId, string $vestDate, string $symbol): void
    {
        $symbol = strtoupper($symbol);
        $settlement = FinRsuVestSettlement::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $vestDate)
            ->where('symbol', $symbol)
            ->with('allocations')
            ->first();

        if ($settlement === null || $settlement->status === 'ignored') {
            return;
        }

        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $vestDate)
            ->where('symbol', $symbol)
            ->whereNotNull('vest_price')
            ->get();

        if ($awards->isEmpty()) {
            // No priced awards remain in this bucket (the award moved to another
            // vest date/symbol, or had its vest price cleared). Any allocations
            // left behind reference awards that no longer belong here, so remove
            // them (cascading their links) and drop the now-empty settlement
            // instead of recomputing gross income from stale allocations.
            $settlement->allocations()->delete();
            $settlement->delete();

            return;
        }

        $summary = $this->summary($awards);
        $settlement->fill([
            'vest_price' => $summary['vestPrice'],
            'vest_price_source' => $summary['vestPriceSource'],
            'gross_shares' => $summary['grossShares'],
            'gross_income' => $summary['grossIncome'],
        ]);
        $settlement->save();

        if ($settlement->allocations->isEmpty()) {
            return;
        }

        // The vest price and/or gross share count may have changed; recompute
        // the stored withholding fields from the current values and re-enforce
        // the confirm-time invariants (withheld shares <= gross vested shares;
        // actual tax <= withheld value) before re-allocating.
        $withholding = $this->recomputeWithholding($settlement, $summary['vestPrice'], $summary['grossShares']);
        $settlement->fill($withholding);
        $settlement->save();

        $this->replaceAllocations(
            $settlement,
            $awards,
            $withholding['withheld_shares_whole'],
            $withholding['withheld_value'],
            $withholding['actual_tax_remitted'],
            $withholding['excess_refund'],
        );
    }

    /**
     * Backfill the link's equity_award_id from its allocation when a link is
     * attached only at the allocation level. Each allocation belongs to exactly
     * one award, so deriving the award id makes allocation-only links visible on
     * the award-level RSU response (which loads links by equity_award_id).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function deriveAllocationAwardId(FinRsuVestSettlement $settlement, array $data): array
    {
        if (($data['equity_award_id'] ?? null) !== null) {
            return $data;
        }

        if (($data['settlement_allocation_id'] ?? null) === null) {
            return $data;
        }

        $allocation = FinRsuVestSettlementAllocation::query()
            ->where('settlement_id', $settlement->id)
            ->where('id', $data['settlement_allocation_id'])
            ->first();

        if ($allocation !== null) {
            $data['equity_award_id'] = $allocation->equity_award_id;
        }

        return $data;
    }

    /** @param array<string, mixed> $data */
    public function assertLinkTargetsBelongToSettlement(int $userId, FinRsuVestSettlement $settlement, array $data): void
    {
        $allocation = null;
        if (($data['settlement_allocation_id'] ?? null) !== null) {
            $allocation = FinRsuVestSettlementAllocation::query()
                ->where('settlement_id', $settlement->id)
                ->where('id', $data['settlement_allocation_id'])
                ->firstOrFail();
        }

        if (($data['equity_award_id'] ?? null) !== null) {
            $award = FinEquityAwards::query()
                ->where('uid', $userId)
                ->where('id', $data['equity_award_id'])
                ->whereDate('vest_date', $settlement->vest_date)
                ->where('symbol', $settlement->symbol)
                ->firstOrFail();

            // Once a settlement is confirmed it owns a concrete set of allocated awards;
            // require the linked award to be one of them. Suggested settlements have no
            // allocations yet, so they fall back to the vest_date+symbol scope above.
            $allocatedAwardIds = $settlement->allocations()->pluck('equity_award_id');
            if ($allocatedAwardIds->isNotEmpty() && ! $allocatedAwardIds->contains((int) $award->id)) {
                throw ValidationException::withMessages([
                    'equity_award_id' => 'The equity award must belong to this settlement.',
                ]);
            }

            if ($allocation instanceof FinRsuVestSettlementAllocation && (int) $allocation->equity_award_id !== (int) $award->id) {
                throw ValidationException::withMessages([
                    'equity_award_id' => 'The equity award must match the settlement allocation award.',
                ]);
            }
        }

        $this->assertExternalTargetsBelongToUser($userId, $data);
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return array<string, mixed>
     */
    private function persistSuggestion(int $userId, Collection $awards): array
    {
        $summary = $this->summary($awards);
        /** @var FinEquityAwards $first */
        $first = $awards->first();
        $vestDate = Carbon::parse((string) $first->vest_date)->format('Y-m-d');
        $settlement = FinRsuVestSettlement::query()
            ->where('uid', $userId)
            ->whereDate('vest_date', $vestDate)
            ->where('symbol', $first->symbol)
            ->first()
            ?? new FinRsuVestSettlement([
                'uid' => $userId,
                'vest_date' => $vestDate,
                'symbol' => $first->symbol,
            ]);

        if ($settlement->exists && in_array($settlement->status, ['confirmed', 'partially_reconciled', 'reconciled', 'ignored'], true)) {
            return [];
        }

        $settlement->fill([
            'vest_price' => $summary['vestPrice'],
            'vest_price_source' => $summary['vestPriceSource'],
            'gross_shares' => $summary['grossShares'],
            'gross_income' => $summary['grossIncome'],
            'status' => 'suggested',
        ]);
        $settlement->save();

        return $this->suggestionFromAwards($awards, $settlement);
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return array<string, mixed>
     */
    private function suggestionFromAwards(Collection $awards, FinRsuVestSettlement $settlement): array
    {
        $summary = $this->summary($awards);
        /** @var FinEquityAwards $first */
        $first = $awards->first();

        return [
            'id' => $settlement->id,
            'settlementId' => $settlement->id,
            'status' => $settlement->status,
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

    /**
     * Recompute the settlement's stored withholding fields from the current
     * vest price and gross share count, re-enforcing the confirm-time
     * invariants. An award edit can change the vest price (so withheld value
     * and refund must be re-derived) or reduce gross shares below the recorded
     * withheld share count (which must be clamped, since you cannot withhold
     * more shares than vested). The derivation mirrors confirm():
     * withheld_value = withheld_shares * vest_price and
     * excess_refund = withheld_value - actual_tax_remitted.
     *
     * @return array{withheld_shares_whole: ?float, withheld_value: ?float, actual_tax_remitted: ?float, excess_refund: ?float}
     */
    private function recomputeWithholding(FinRsuVestSettlement $settlement, ?float $vestPrice, float $grossShares): array
    {
        $withheldShares = $settlement->withheld_shares_whole !== null ? (float) $settlement->withheld_shares_whole : null;
        if ($withheldShares !== null && $withheldShares > $grossShares) {
            $withheldShares = $grossShares;
        }

        $withheldValue = ($withheldShares === null || $vestPrice === null)
            ? null
            : round($withheldShares * $vestPrice, 4);

        $actualTaxRemitted = $settlement->actual_tax_remitted !== null ? (float) $settlement->actual_tax_remitted : null;
        if ($actualTaxRemitted !== null && $withheldValue !== null && $actualTaxRemitted > $withheldValue) {
            $actualTaxRemitted = $withheldValue;
        }

        $excessRefund = ($withheldValue === null || $actualTaxRemitted === null)
            ? null
            : round($withheldValue - $actualTaxRemitted, 4);

        return [
            'withheld_shares_whole' => $withheldShares,
            'withheld_value' => $withheldValue,
            'actual_tax_remitted' => $actualTaxRemitted,
            'excess_refund' => $excessRefund,
        ];
    }

    /**
     * Reconcile a settlement's allocations against the supplied awards without
     * deleting-and-recreating rows. Existing allocations are updated in place
     * (keyed by equity_award_id) so that fin_rsu_links rows that reference a
     * settlement_allocation_id survive an edit; only allocations whose award is
     * no longer part of the settlement are removed.
     *
     * @param  Collection<int, FinEquityAwards>  $awards
     */
    private function replaceAllocations(FinRsuVestSettlement $settlement, Collection $awards, ?float $withheldShares, ?float $withheldValue, ?float $actualTaxRemitted, ?float $excessRefund): void
    {
        $grossShares = (float) $settlement->gross_shares;
        $existing = $settlement->allocations()->get()->keyBy(fn (FinRsuVestSettlementAllocation $allocation): int => (int) $allocation->equity_award_id);
        $retainedAwardIds = [];

        foreach ($awards as $award) {
            $retainedAwardIds[] = (int) $award->id;
            $ratio = $grossShares === 0.0 ? 0.0 : (float) $award->share_count / $grossShares;
            $attributes = [
                'vested_shares' => $award->share_count,
                'gross_income' => round((float) $award->share_count * (float) $award->vest_price, 4),
                'allocation_ratio' => round($ratio, 10),
                'allocated_withheld_shares' => $withheldShares === null ? null : round($withheldShares * $ratio, 6),
                'allocated_withheld_value' => $withheldValue === null ? null : round($withheldValue * $ratio, 4),
                'allocated_tax_remitted' => $actualTaxRemitted === null ? null : round($actualTaxRemitted * $ratio, 4),
                'allocated_excess_refund' => $excessRefund === null ? null : round($excessRefund * $ratio, 4),
            ];

            $allocation = $existing->get((int) $award->id);
            if ($allocation instanceof FinRsuVestSettlementAllocation) {
                $allocation->update($attributes);

                continue;
            }

            $settlement->allocations()->create($attributes + ['equity_award_id' => $award->id]);
        }

        $settlement->allocations()
            ->whereNotIn('equity_award_id', $retainedAwardIds === [] ? [0] : $retainedAwardIds)
            ->delete();
    }

    private function reconcileAllocatedSettlement(FinRsuVestSettlement $settlement): void
    {
        $grossShares = (float) $settlement->allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->vested_shares);

        if ($grossShares === 0.0) {
            $settlement->delete();

            return;
        }

        $grossIncome = (float) $settlement->allocations->sum(fn (FinRsuVestSettlementAllocation $allocation): float => (float) $allocation->gross_income);
        $vestPrice = $grossShares === 0.0 ? null : round($grossIncome / $grossShares, 6);

        $withholding = $this->recomputeWithholding($settlement, $vestPrice, $grossShares);

        $settlement->fill([
            'vest_price' => $vestPrice,
            'gross_shares' => round($grossShares, 6),
            'gross_income' => round($grossIncome, 4),
        ] + $withholding);
        $settlement->save();

        $withheldShares = $withholding['withheld_shares_whole'];
        $withheldValue = $withholding['withheld_value'];
        $actualTaxRemitted = $withholding['actual_tax_remitted'];
        $excessRefund = $withholding['excess_refund'];

        foreach ($settlement->allocations as $allocation) {
            $ratio = $grossShares === 0.0 ? 0.0 : (float) $allocation->vested_shares / $grossShares;
            $allocation->update([
                'allocation_ratio' => round($ratio, 10),
                'allocated_withheld_shares' => $withheldShares === null ? null : round($withheldShares * $ratio, 6),
                'allocated_withheld_value' => $withheldValue === null ? null : round($withheldValue * $ratio, 4),
                'allocated_tax_remitted' => $actualTaxRemitted === null ? null : round($actualTaxRemitted * $ratio, 4),
                'allocated_excess_refund' => $excessRefund === null ? null : round($excessRefund * $ratio, 4),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array{grossShares: float, vestPrice: ?float, vestPriceSource: ?string, grossIncome: float}  $summary
     * @return array{withheld_shares_whole: ?float, actual_tax_remitted: ?float, brokerage_account_id: ?int, payslip_id: ?int, refund_payslip_id: ?int, notes: ?string}
     */
    private function validateConfirmationData(int $userId, array $data, array $summary): array
    {
        $rawWithheldShares = $this->blankToNull($data['withheldSharesWhole'] ?? $data['withheld_shares_whole'] ?? null);
        $rawActualTaxRemitted = $this->blankToNull($data['actualTaxRemitted'] ?? $data['actual_tax_remitted'] ?? null);

        $withheldShares = $this->nullableFloat($rawWithheldShares);
        $withheldValue = $withheldShares === null || $summary['vestPrice'] === null ? null : round($withheldShares * $summary['vestPrice'], 4);
        $normalized = [
            'withheld_shares_whole' => $rawWithheldShares,
            'actual_tax_remitted' => $rawActualTaxRemitted,
            'brokerage_account_id' => $this->blankToNull($data['brokerageAccountId'] ?? $data['brokerage_account_id'] ?? null),
            'payslip_id' => $this->blankToNull($data['payslipId'] ?? $data['payslip_id'] ?? null),
            'refund_payslip_id' => $this->blankToNull($data['refundPayslipId'] ?? $data['refund_payslip_id'] ?? null),
            'notes' => isset($data['notes']) ? (string) $data['notes'] : null,
        ];

        $validator = Validator::make($normalized, [
            'withheld_shares_whole' => [
                'nullable',
                'numeric',
                'min:0',
                function (string $attribute, mixed $value, Closure $fail) use ($summary): void {
                    $numeric = (float) $value;
                    if (abs($numeric - floor($numeric)) > 0.000001) {
                        $fail('Withheld shares must be whole shares.');
                    }
                    if ($numeric > $summary['grossShares']) {
                        $fail('Withheld shares may not exceed gross vested shares.');
                    }
                },
            ],
            'actual_tax_remitted' => [
                'nullable',
                'numeric',
                'min:0',
                function (string $attribute, mixed $value, Closure $fail) use ($withheldValue): void {
                    if ($withheldValue !== null && (float) $value > $withheldValue) {
                        $fail('Actual tax remitted may not exceed withheld value.');
                    }
                },
            ],
            'brokerage_account_id' => ['nullable', 'integer'],
            'payslip_id' => ['nullable', 'integer'],
            'refund_payslip_id' => ['nullable', 'integer'],
            'notes' => ['nullable', 'string'],
        ]);

        $validator->validate();

        $validated = [
            'withheld_shares_whole' => $this->nullableFloat($rawWithheldShares),
            'actual_tax_remitted' => $this->nullableFloat($rawActualTaxRemitted),
            'brokerage_account_id' => $this->nullableInt($normalized['brokerage_account_id']),
            'payslip_id' => $this->nullableInt($normalized['payslip_id']),
            'refund_payslip_id' => $this->nullableInt($normalized['refund_payslip_id']),
            'notes' => $normalized['notes'],
        ];
        $this->assertExternalTargetsBelongToUser($userId, $validated);

        return $validated;
    }

    /** @param array<string, mixed> $data */
    private function assertExternalTargetsBelongToUser(int $userId, array $data): void
    {
        if (($data['transaction_id'] ?? null) !== null) {
            FinAccountLineItems::query()->where('t_id', $data['transaction_id'])->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', $userId))->firstOrFail();
        }
        if (($data['account_id'] ?? null) !== null) {
            FinAccounts::query()->withoutGlobalScopes()->where('acct_owner', $userId)->where('acct_id', $data['account_id'])->firstOrFail();
        }
        if (($data['lot_id'] ?? null) !== null) {
            FinAccountLot::query()->where('lot_id', $data['lot_id'])->whereHas('account', fn ($query) => $query->withoutGlobalScopes()->where('acct_owner', $userId))->firstOrFail();
        }
        if (($data['payslip_id'] ?? null) !== null) {
            FinPayslips::query()->withoutGlobalScopes()->where('uid', $userId)->where('payslip_id', $data['payslip_id'])->firstOrFail();
        }
        if (($data['refund_payslip_id'] ?? null) !== null) {
            FinPayslips::query()->withoutGlobalScopes()->where('uid', $userId)->where('payslip_id', $data['refund_payslip_id'])->firstOrFail();
        }
        if (($data['brokerage_account_id'] ?? null) !== null) {
            FinAccounts::query()->withoutGlobalScopes()->where('acct_owner', $userId)->where('acct_id', $data['brokerage_account_id'])->firstOrFail();
        }
    }

    private function blankToNull(mixed $value): mixed
    {
        if ($value === null || (is_string($value) && trim($value) === '')) {
            return null;
        }

        return $value;
    }

    private function nullableFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value;
    }

    private function nullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (int) $value;
    }
}
