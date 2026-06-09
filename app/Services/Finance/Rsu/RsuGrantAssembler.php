<?php

namespace App\Services\Finance\Rsu;

use App\Models\FinanceTool\FinEquityAwards;
use App\Services\Finance\MoneyMath;
use DateTimeImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class RsuGrantAssembler
{
    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return list<array<string, mixed>>
     */
    public function assemble(Collection $awards): array
    {
        return $awards->groupBy(fn (FinEquityAwards $award): string => implode('|', [
            $award->award_id,
            (string) $award->grant_date,
            $award->symbol,
        ]))->values()->map(function (Collection $group): array {
            /** @var FinEquityAwards $first */
            $first = $group->first();
            $grantDate = (string) $first->grant_date;
            $vestDates = $group
                ->map(fn (FinEquityAwards $award): string => (string) $award->vest_date)
                ->filter(fn (string $date): bool => $date !== '')
                ->sort()
                ->values()
                ->all();
            $firstVest = $vestDates[0] ?? null;
            $lastVest = $vestDates !== [] ? $vestDates[array_key_last($vestDates)] : null;
            $grantPrice = $group
                ->map(fn (FinEquityAwards $award): ?float => $award->grant_price !== null ? (float) $award->grant_price : null)
                ->first(fn (?float $price): bool => $price !== null);
            $events = $group->sortBy('vest_date')->values()->map(fn (FinEquityAwards $award): array => [
                'vestDate' => (string) $award->vest_date,
                'shareCount' => (float) $award->share_count,
                'sourceAwardId' => $award->award_id,
                'sourceAwardRowId' => $award->id,
                'symbol' => $award->symbol,
                'grantPrice' => $award->grant_price === null ? null : MoneyMath::round((float) $award->grant_price),
                'vestPrice' => $award->vest_price === null ? null : MoneyMath::round((float) $award->vest_price),
            ])->all();
            $rowIds = $group->pluck('id')->map(fn ($id): int => (int) $id)->values()->all();

            return [
                'id' => 'rsu-tool-'.Str::slug((string) $first->award_id ?: (string) $first->id),
                'sourceAwardId' => $first->award_id,
                'sourceAwardRowIds' => $rowIds,
                'symbol' => $first->symbol,
                'kind' => 'hire',
                'grantDate' => $grantDate,
                'shareCount' => (float) $group->sum(fn (FinEquityAwards $award): float => (float) $award->share_count),
                'grantValue' => null,
                'grantPrice' => $grantPrice !== null ? MoneyMath::round($grantPrice) : null,
                'cliffMonths' => $firstVest !== null ? $this->monthsBetween($grantDate, $firstVest) : 0,
                'vestingYears' => $lastVest !== null ? $this->vestingYearsFromMonths($this->monthsBetween($grantDate, $lastVest)) : 1,
                'vestingFrequency' => $this->inferVestingFrequency($vestDates),
                'vestingEvents' => $events,
                'rsuSource' => [
                    'mode' => 'snapshot',
                    'capturedAt' => now()->toIso8601String(),
                    'source' => 'fin_equity_awards',
                    'sourceAwardRowIds' => $rowIds,
                    'sourceHash' => hash('sha256', json_encode($events, JSON_THROW_ON_ERROR)),
                ],
            ];
        })->all();
    }

    private function vestingYearsFromMonths(int $months): int|float
    {
        $months = max(3, $months);

        return $months % 12 === 0
            ? (int) ($months / 12)
            : round($months / 12, 4);
    }

    /** @param list<string> $vestDates */
    private function inferVestingFrequency(array $vestDates): string
    {
        $count = count($vestDates);

        if ($count <= 1) {
            return 'annual';
        }

        $gaps = [];
        for ($i = 1; $i < $count; $i++) {
            $gaps[] = $this->monthsBetween($vestDates[$i - 1], $vestDates[$i]);
        }

        sort($gaps);
        $medianGap = $gaps[intdiv(count($gaps) - 1, 2)];

        if ($medianGap <= 2) {
            return 'monthly';
        }

        if ($medianGap <= 6) {
            return 'quarterly';
        }

        return 'annual';
    }

    private function monthsBetween(string $from, string $to): int
    {
        $start = DateTimeImmutable::createFromFormat('!Y-m-d', $from);
        $end = DateTimeImmutable::createFromFormat('!Y-m-d', $to);

        if (! $start instanceof DateTimeImmutable || ! $end instanceof DateTimeImmutable || $end < $start) {
            return 0;
        }

        $diff = $start->diff($end);
        $months = $diff->y * 12 + $diff->m;

        return $diff->d >= 15 ? $months + 1 : $months;
    }
}
