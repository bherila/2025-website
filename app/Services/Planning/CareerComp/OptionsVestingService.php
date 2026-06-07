<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class OptionsVestingService
{
    /**
     * @return array{rows:list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>,warnings:list<string>}
     */
    public function expand(JobSpec $job, int $startYear, int $horizonYears): array
    {
        $rawRows = [];

        foreach ($job->optionGrants() as $grant) {
            foreach ($this->sharesByYear($grant) as $year => $shares) {
                if ($year < $startYear || $year >= $startYear + $horizonYears) {
                    continue;
                }

                $rawRows[] = [
                    'grantId' => (string) ($grant['id'] ?? 'option'),
                    'requestedType' => (string) ($grant['type'] ?? 'nso') === 'iso' ? 'iso' : 'nso',
                    'year' => $year,
                    'shares' => round($shares, 4),
                    'strike' => is_numeric($grant['strike'] ?? null) ? (float) $grant['strike'] : 0.0,
                    'grantDate' => (string) ($grant['grantDate'] ?? ''),
                ];
            }
        }

        usort($rawRows, fn (array $left, array $right): int => [$left['year'], $left['grantDate'], $left['grantId']] <=> [$right['year'], $right['grantDate'], $right['grantId']]);

        $usedIsoValueByYear = [];
        $rows = [];
        $warnings = [];

        foreach ($rawRows as $rawRow) {
            if ($rawRow['requestedType'] !== 'iso') {
                $rows[] = $this->row($rawRow, 'nso', $rawRow['shares']);

                continue;
            }

            $year = (int) $rawRow['year'];
            $strike = (float) $rawRow['strike'];
            $shares = (float) $rawRow['shares'];
            $alreadyUsed = $usedIsoValueByYear[$year] ?? 0.0;
            $remainingIsoValue = max(0.0, MoneyMath::subtract(100000.0, $alreadyUsed));
            $requestedValue = MoneyMath::multiply($strike, $shares);
            $isoShares = $strike > 0.0 ? min($shares, MoneyMath::divide($remainingIsoValue, $strike)) : 0.0;
            $nsoShares = max(0.0, $shares - $isoShares);
            $usedIsoValueByYear[$year] = MoneyMath::add($alreadyUsed, MoneyMath::multiply($strike, $isoShares));

            if ($isoShares > 0.0) {
                $rows[] = $this->row($rawRow, 'iso', $isoShares);
            }
            if ($nsoShares > 0.0) {
                $rows[] = $this->row($rawRow, 'nso', $nsoShares);
            }
            if ($requestedValue > $remainingIsoValue && ! in_array("{$job->name()}: ISO first-exercisable value exceeds $100k in {$year}; spillover treated as NSO.", $warnings, true)) {
                $warnings[] = "{$job->name()}: ISO first-exercisable value exceeds $100k in {$year}; spillover treated as NSO.";
            }
        }

        return ['rows' => $rows, 'warnings' => $warnings];
    }

    /**
     * @param  array<string, mixed>  $rawRow
     * @return array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}
     */
    private function row(array $rawRow, string $type, float $shares): array
    {
        return [
            'grantId' => (string) $rawRow['grantId'],
            'type' => $type,
            'year' => (int) $rawRow['year'],
            'vestedShares' => round($shares, 4),
            'exercisableShares' => round($shares, 4),
        ];
    }

    /**
     * @param  array<string, mixed>  $grant
     * @return array<int, float>
     */
    private function sharesByYear(array $grant): array
    {
        $shareCount = is_numeric($grant['shareCount'] ?? null) ? (float) $grant['shareCount'] : 0.0;
        $grantDate = $this->date((string) ($grant['grantDate'] ?? ''));
        if ($shareCount <= 0.0 || ! $grantDate instanceof DateTimeImmutable) {
            return [];
        }

        if (filter_var($grant['earlyExercise83b'] ?? false, FILTER_VALIDATE_BOOL)) {
            return [(int) $grantDate->format('Y') => $shareCount];
        }

        return VestingSchedule::sharesByYearForGrant(
            $shareCount,
            $this->date((string) ($grant['vestingStartDate'] ?? '')) ?? $grantDate,
            $grant,
        );
    }

    private function date(string $date): ?DateTimeImmutable
    {
        if ($date === '') {
            return null;
        }

        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);

        return $parsed instanceof DateTimeImmutable ? $parsed : null;
    }
}
