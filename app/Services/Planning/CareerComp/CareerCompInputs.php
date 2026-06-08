<?php

namespace App\Services\Planning\CareerComp;

final class CareerCompInputs
{
    /**
     * @param  array<string, mixed>  $values
     */
    private function __construct(private array $values) {}

    /**
     * @param  array<string, mixed>  $values
     */
    public static function fromArray(array $values): self
    {
        $currentJobProvidedAsNull = array_key_exists('currentJob', $values) && $values['currentJob'] === null;
        $values = self::withoutNulls($values);
        $merged = array_replace_recursive(self::defaults(), $values);

        if ($currentJobProvidedAsNull) {
            $merged['currentJob'] = null;
        } elseif (array_key_exists('currentJob', $values)) {
            $merged['currentJob'] = $values['currentJob'];
        }
        if (array_key_exists('hypotheticalJobs', $values)) {
            $merged['hypotheticalJobs'] = $values['hypotheticalJobs'];
        }

        return new self($merged);
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        $startYear = (int) date('Y');

        return [
            'horizonYears' => 10,
            'startYear' => $startYear,
            'modelAssumptions' => ModelAssumptions::defaults(),
            'currentJob' => [
                'id' => 'current',
                'name' => 'Current role',
                'startDate' => null,
                'company' => [
                    'type' => 'public',
                    'currentSharePrice' => 80.0,
                    'fourNineA' => 0.0,
                    'fullyDilutedShares' => 0.0,
                    'annualDilutionPct' => 0.0,
                    'liquidityDate' => null,
                    'valuationScenarios' => [],
                ],
                'comp' => [
                    'baseSalary' => 185000.0,
                    'cashBonus' => 25000.0,
                    'annualRaisePct' => 0.0,
                ],
                'grantTypes' => [
                    'rsu' => true,
                    'options' => true,
                ],
                'refresher' => [
                    'pctOfBase' => 0.0,
                    'optionPctOfFullyDilutedShares' => 0.0,
                    'optionType' => 'iso',
                    'cadenceYears' => 1,
                    'firstYearOffset' => 1,
                    'vestingYears' => 4,
                    'cliffMonths' => 0,
                    'vestingFrequency' => 'monthly',
                ],
                'rsuGrants' => [[
                    'id' => 'current-rsu-hire',
                    'kind' => 'hire',
                    'grantDate' => $startYear.'-01-01',
                    'vestingStartDate' => null,
                    'shareCount' => 1000.0,
                    'grantValue' => null,
                    'grantPrice' => 80.0,
                    'cliffMonths' => 12,
                    'vestingYears' => 4,
                    'vestingFrequency' => 'monthly',
                ]],
                'optionGrants' => [],
                'growthBands' => [
                    'lowPct' => 0.0,
                    'mediumPct' => 5.0,
                    'highPct' => 10.0,
                ],
            ],
            'hypotheticalJobs' => [[
                'id' => 'hyp-1',
                'name' => 'Private offer',
                'startDate' => null,
                'company' => [
                    'type' => 'private',
                    'currentSharePrice' => 0.0,
                    'fourNineA' => 10.0,
                    'fullyDilutedShares' => 10000000,
                    'annualDilutionPct' => 3.0,
                    'liquidityDate' => ($startYear + 4).'-01-01',
                    'valuationScenarios' => [
                        [
                            'id' => 'base',
                            'label' => 'Base case',
                            'outcome' => 'medium',
                            'stages' => [
                                [
                                    'id' => 'stage-current',
                                    'year' => $startYear,
                                    'stage' => 'Current',
                                    'preferredPostMoneyValuation' => 100000000,
                                    'capitalDilutionPct' => 0,
                                    'employeePoolDilutionPct' => 0,
                                    'commonFmv' => 10,
                                    'commonFmvDiscountPct' => 0,
                                    'liquidityEvent' => false,
                                ],
                            ],
                        ],
                    ],
                ],
                'comp' => [
                    'baseSalary' => 175000.0,
                    'cashBonus' => 20000.0,
                    'annualRaisePct' => 0.0,
                ],
                'grantTypes' => [
                    'rsu' => true,
                    'options' => true,
                ],
                'refresher' => [
                    'pctOfBase' => 0.0,
                    'optionPctOfFullyDilutedShares' => 0.0,
                    'optionType' => 'iso',
                    'cadenceYears' => 1,
                    'firstYearOffset' => 1,
                    'vestingYears' => 4,
                    'cliffMonths' => 0,
                    'vestingFrequency' => 'monthly',
                ],
                'rsuGrants' => [],
                'optionGrants' => [[
                    'id' => 'hyp-1-iso-hire',
                    'kind' => 'hire',
                    'type' => 'iso',
                    'grantDate' => $startYear.'-01-01',
                    'vestingStartDate' => null,
                    'shareCount' => 40000.0,
                    'strike' => 2.0,
                    'cliffMonths' => 12,
                    'vestingYears' => 4,
                    'vestingFrequency' => 'monthly',
                    'earlyExercise83b' => false,
                ]],
                'growthBands' => [
                    'lowPct' => -5.0,
                    'mediumPct' => 15.0,
                    'highPct' => 30.0,
                ],
            ]],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->values;
    }

    public function value(string $path): mixed
    {
        $value = $this->values;

        foreach (explode('.', $path) as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                return null;
            }

            $value = $value[$segment];
        }

        return $value;
    }

    public function number(string $path): float
    {
        $value = $this->value($path);

        return is_numeric($value) ? (float) $value : 0.0;
    }

    public function int(string $path): int
    {
        return (int) round($this->number($path));
    }

    public function nullableInt(string $path): ?int
    {
        $value = $this->value($path);

        return is_numeric($value) ? (int) round((float) $value) : null;
    }

    public function bool(string $path): bool
    {
        return filter_var($this->value($path), FILTER_VALIDATE_BOOL);
    }

    public function currentJob(): ?JobSpec
    {
        $job = $this->value('currentJob');

        return JobSpec::nullableFromArray(is_array($job) ? $job : null, true);
    }

    public function modelAssumptions(): ModelAssumptions
    {
        $assumptions = $this->value('modelAssumptions');

        return ModelAssumptions::fromArray(is_array($assumptions) ? $assumptions : []);
    }

    /**
     * @return list<JobSpec>
     */
    public function hypotheticalJobs(): array
    {
        $jobs = $this->value('hypotheticalJobs');
        if (! is_array($jobs)) {
            return [];
        }

        return array_values(array_filter(array_map(
            fn (mixed $job): ?JobSpec => JobSpec::nullableFromArray(is_array($job) ? $job : null, false),
            $jobs,
        )));
    }

    /**
     * @template TKey of array-key
     *
     * @param  array<TKey, mixed>  $values
     * @return array<TKey, mixed>
     */
    private static function withoutNulls(array $values): array
    {
        foreach ($values as $key => $value) {
            if ($value === null) {
                unset($values[$key]);

                continue;
            }

            if (is_array($value)) {
                $values[$key] = self::withoutNulls($value);
            }
        }

        return $values;
    }
}
