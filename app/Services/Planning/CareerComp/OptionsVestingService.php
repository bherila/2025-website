<?php

namespace App\Services\Planning\CareerComp;

use App\Services\Finance\MoneyMath;
use DateTimeImmutable;

final class OptionsVestingService
{
    /**
     * @return array{rows:list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}>,warnings:list<string>}
     */
    public function expand(JobSpec $job, int $startYear, int $horizonYears, ?DateTimeImmutable $vestingThrough = null): array
    {
        $exerciseEvents = [];

        foreach ($job->optionGrants() as $grant) {
            foreach ($this->exerciseEventsForGrant($grant, $vestingThrough) as $event) {
                $exerciseEvents[] = $event;
            }
        }

        usort($exerciseEvents, fn (array $left, array $right): int => [$left['year'], $left['grantDate'], $left['grantId']] <=> [$right['year'], $right['grantDate'], $right['grantId']]);

        $usedIsoValueByYear = [];
        $rowsByKey = [];
        $warnings = [];

        foreach ($exerciseEvents as $event) {
            if ($event['requestedType'] !== 'iso') {
                $this->appendRowsForSlice($rowsByKey, $event, 'nso', $event['shares']);

                continue;
            }

            $year = (int) $event['year'];
            $strike = (float) $event['strike'];
            $shares = (float) $event['shares'];
            $alreadyUsed = $usedIsoValueByYear[$year] ?? 0.0;
            $remainingIsoValue = max(0.0, MoneyMath::subtract(100000.0, $alreadyUsed));
            $requestedValue = MoneyMath::multiply($strike, $shares);
            $isoShares = $strike > 0.0 ? min($shares, MoneyMath::divide($remainingIsoValue, $strike)) : 0.0;
            $nsoShares = max(0.0, $shares - $isoShares);
            $usedIsoValueByYear[$year] = MoneyMath::add($alreadyUsed, MoneyMath::multiply($strike, $isoShares));

            if ($isoShares > 0.0) {
                $this->appendRowsForSlice($rowsByKey, $event, 'iso', $isoShares);
            }
            if ($nsoShares > 0.0) {
                $this->appendRowsForSlice($rowsByKey, $event, 'nso', $nsoShares);
            }
            if ($requestedValue > $remainingIsoValue && ! in_array("{$job->name()}: ISO first-exercisable value exceeds $100k in {$year}; spillover treated as NSO.", $warnings, true)) {
                $warnings[] = "{$job->name()}: ISO first-exercisable value exceeds $100k in {$year}; spillover treated as NSO.";
            }
        }

        $rows = array_values(array_filter(array_map(
            fn (array $row): array => $this->row($row),
            $rowsByKey,
        ), fn (array $row): bool => $row['year'] >= $startYear
            && $row['year'] < $startYear + $horizonYears
            && ($row['vestedShares'] > 0.0 || $row['exercisableShares'] > 0.0)
        ));
        usort($rows, fn (array $left, array $right): int => [$left['year'], $left['grantId'], $left['type']] <=> [$right['year'], $right['grantId'], $right['type']]);

        return ['rows' => $rows, 'warnings' => $warnings];
    }

    /**
     * @param  array<string, mixed>  $rawRow
     * @return array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string}
     */
    private function row(array $rawRow): array
    {
        $row = [
            'grantId' => (string) $rawRow['grantId'],
            'type' => (string) $rawRow['type'],
            'year' => (int) $rawRow['year'],
            'vestedShares' => round((float) $rawRow['vestedShares'], 4),
            'exercisableShares' => round((float) $rawRow['exercisableShares'], 4),
        ];

        if (is_string($rawRow['source'] ?? null) && $rawRow['source'] !== '') {
            $row['source'] = $rawRow['source'];
        }

        return $row;
    }

    /**
     * @param  array<string, mixed>  $grant
     * @return list<array{grantId:string,requestedType:string,year:int,shares:float,strike:float,grantDate:string,earlyExercise:bool,vestingSharesByYear:array<int, float>,source?:string|null}>
     */
    private function exerciseEventsForGrant(array $grant, ?DateTimeImmutable $vestingThrough): array
    {
        $shareCount = is_numeric($grant['shareCount'] ?? null) ? (float) $grant['shareCount'] : 0.0;
        $grantDate = $this->date((string) ($grant['grantDate'] ?? ''));
        if ($shareCount <= 0.0 || ! $grantDate instanceof DateTimeImmutable) {
            return [];
        }

        $vestingSharesByYear = $this->vestingSharesByYear(
            $shareCount,
            $this->date((string) ($grant['vestingStartDate'] ?? '')) ?? $grantDate,
            $grant,
            $vestingThrough,
        );
        $grantId = (string) ($grant['id'] ?? 'option');
        $requestedType = (string) ($grant['type'] ?? 'nso') === 'iso' ? 'iso' : 'nso';
        $strike = is_numeric($grant['strike'] ?? null) ? (float) $grant['strike'] : 0.0;
        $source = is_string($grant['source'] ?? null) ? $grant['source'] : null;
        $grantDateString = (string) ($grant['grantDate'] ?? '');
        $earlyExercise = filter_var($grant['earlyExercise83b'] ?? false, FILTER_VALIDATE_BOOL);

        if ($earlyExercise) {
            if ($vestingThrough instanceof DateTimeImmutable && $grantDate > $vestingThrough) {
                return [];
            }

            return [[
                'grantId' => $grantId,
                'requestedType' => $requestedType,
                'year' => (int) $grantDate->format('Y'),
                'shares' => round($shareCount, 4),
                'strike' => $strike,
                'grantDate' => $grantDateString,
                'earlyExercise' => true,
                'vestingSharesByYear' => $vestingSharesByYear,
                'source' => $source,
            ]];
        }

        $events = [];
        foreach ($vestingSharesByYear as $year => $shares) {
            $events[] = [
                'grantId' => $grantId,
                'requestedType' => $requestedType,
                'year' => $year,
                'shares' => round($shares, 4),
                'strike' => $strike,
                'grantDate' => $grantDateString,
                'earlyExercise' => false,
                'vestingSharesByYear' => [$year => $shares],
                'source' => $source,
            ];
        }

        return $events;
    }

    /**
     * @param  array<string, mixed>  $grant
     * @return array<int, float>
     */
    private function vestingSharesByYear(float $shareCount, DateTimeImmutable $vestingStartDate, array $grant, ?DateTimeImmutable $vestingThrough): array
    {
        $sharesByYear = [];
        foreach (VestingSchedule::vestingEventsForGrant($shareCount, $vestingStartDate, $grant) as $event) {
            if ($vestingThrough instanceof DateTimeImmutable && $event['date'] > $vestingThrough) {
                continue;
            }

            $year = (int) $event['date']->format('Y');
            $sharesByYear[$year] = ($sharesByYear[$year] ?? 0.0) + $event['shares'];
        }

        ksort($sharesByYear);

        return $sharesByYear;
    }

    /**
     * @param  array<string, array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string|null}>  $rowsByKey
     * @param  array{grantId:string,year:int,shares:float,earlyExercise:bool,vestingSharesByYear:array<int, float>,source?:string|null}  $event
     */
    private function appendRowsForSlice(array &$rowsByKey, array $event, string $type, float $sliceShares): void
    {
        if ($sliceShares <= 0.0 || (float) $event['shares'] <= 0.0) {
            return;
        }

        if (! $event['earlyExercise']) {
            $this->addRow($rowsByKey, $event, $type, (int) $event['year'], $sliceShares, $sliceShares);

            return;
        }

        $ratio = $sliceShares / (float) $event['shares'];
        $this->addRow($rowsByKey, $event, $type, (int) $event['year'], 0.0, $sliceShares);

        foreach ($event['vestingSharesByYear'] as $year => $vestedShares) {
            $this->addRow($rowsByKey, $event, $type, $year, (float) $vestedShares * $ratio, 0.0);
        }
    }

    /**
     * @param  array<string, array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float,source?:string|null}>  $rowsByKey
     * @param  array{grantId:string,source?:string|null}  $event
     */
    private function addRow(array &$rowsByKey, array $event, string $type, int $year, float $vestedShares, float $exercisableShares): void
    {
        if ($vestedShares <= 0.0 && $exercisableShares <= 0.0) {
            return;
        }

        $key = implode(':', [(string) $event['grantId'], $type, (string) $year]);
        $rowsByKey[$key] ??= [
            'grantId' => (string) $event['grantId'],
            'type' => $type,
            'year' => $year,
            'vestedShares' => 0.0,
            'exercisableShares' => 0.0,
            'source' => $event['source'] ?? null,
        ];

        $rowsByKey[$key]['vestedShares'] += $vestedShares;
        $rowsByKey[$key]['exercisableShares'] += $exercisableShares;
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
