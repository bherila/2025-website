<?php

namespace App\Services\Planning;

use App\Services\Tax\PureTaxMath\FilingStatus;

final class RothConversionInputs
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
        $values = self::withoutNulls($values);
        $merged = array_replace_recursive(self::defaults(), $values);
        if (array_key_exists('scenarios', $values)) {
            $merged['scenarios'] = $values['scenarios'];
        }
        if (is_array($values['strategy'] ?? null) && array_key_exists('perYearConversions', $values['strategy'])) {
            $merged['strategy']['perYearConversions'] = $values['strategy']['perYearConversions'];
        }

        return new self($merged);
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        $currentYear = (int) date('Y');
        $currentAge = 58;

        return [
            'currentYear' => $currentYear,
            'filingStatus' => FilingStatus::MarriedFilingJointly->value,
            'people' => [
                'primaryBirthYear' => $currentYear - $currentAge,
                'primaryCurrentAge' => $currentAge,
                'primaryEndAge' => 95,
                'spouseBirthYear' => $currentYear - 56,
                'spouseCurrentAge' => 56,
                'spouseEndAge' => 95,
                'firstDeathAge' => null,
            ],
            'income' => [
                'wagesPrimary' => 180000.0,
                'wagesSpouse' => 0.0,
                'retirementAgePrimary' => 62,
                'retirementAgeSpouse' => 62,
                'selfEmploymentPrimary' => 0.0,
                'selfEmploymentSpouse' => 0.0,
                'interest' => 8000.0,
                'taxExemptInterest' => 0.0,
                'qualifiedDividends' => 12000.0,
                'longTermCapitalGains' => 10000.0,
                'otherOrdinary' => 20000.0,
            ],
            'socialSecurity' => [
                'piaPrimary' => 3200.0,
                'piaSpouse' => 1600.0,
                'fraPrimary' => 67,
                'fraSpouse' => 67,
                'claimAgePrimary' => 70,
                'claimAgeSpouse' => 67,
                'colaPercent' => 2.5,
            ],
            'balances' => [
                'traditionalPrimary' => 900000.0,
                'traditionalSpouse' => 350000.0,
                'rothPrimary' => 180000.0,
                'rothSpouse' => 80000.0,
                'hsa' => 35000.0,
                'taxableBrokerage' => 450000.0,
                'taxableBasis' => 320000.0,
                'cash' => 90000.0,
            ],
            'strategy' => [
                'name' => 'Convert to top of 24%',
                'conversionMode' => 'fill_bracket',
                'conversionStartAge' => 62,
                'conversionEndAge' => 72,
                'annualConversion' => 60000.0,
                'bracketTarget' => 24,
                'perYearConversions' => [],
                'harvestLtcg' => true,
                'ltcgTargetRate' => 0,
                'withdrawalOrder' => 'tax_deferred_taxable_roth',
            ],
            'scenarios' => [
                [
                    'name' => 'Convert to top of 24%',
                    'strategy' => [],
                ],
                [
                    'name' => 'No conversion',
                    'strategy' => [
                        'conversionMode' => 'constant',
                        'annualConversion' => 0.0,
                    ],
                ],
                [
                    'name' => 'Top of 12%',
                    'strategy' => [
                        'conversionMode' => 'fill_bracket',
                        'bracketTarget' => 12,
                    ],
                ],
            ],
            'assumptions' => [
                'preRetirementGrowthPercent' => 6.0,
                'postRetirementGrowthPercent' => 5.0,
                'cashYieldPercent' => 0.0,
                'inflationPercent' => 2.5,
                'stateTaxPercent' => 5.0,
                'stateTaxesLtcg' => true,
                'deductionMode' => 'standard',
                'customDeduction' => 0.0,
                'discountRatePercent' => 3.0,
                'priorYearMagi' => 0.0,
                'twoYearsPriorMagi' => 0.0,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->values;
    }

    public function filingStatus(): FilingStatus
    {
        return FilingStatus::fromInput((string) $this->value('filingStatus'));
    }

    public function int(string $path): int
    {
        /** Numeric UI inputs can arrive as decimals; rounding keeps age/year values stable after validation. */
        return (int) round($this->number($path));
    }

    public function nullableInt(string $path): ?int
    {
        $value = $this->value($path);

        return is_numeric($value) ? (int) round((float) $value) : null;
    }

    public function number(string $path): float
    {
        $value = $this->value($path);

        return is_numeric($value) ? (float) $value : 0.0;
    }

    public function bool(string $path): bool
    {
        return filter_var($this->value($path), FILTER_VALIDATE_BOOL);
    }

    /**
     * @return array<string, mixed>
     */
    public function strategy(): array
    {
        $strategy = $this->value('strategy');

        return is_array($strategy) ? $strategy : [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function scenarios(): array
    {
        $scenarios = $this->value('scenarios');

        if (! is_array($scenarios) || $scenarios === []) {
            return [['name' => (string) ($this->strategy()['name'] ?? 'Base strategy'), 'strategy' => $this->strategy()]];
        }

        return array_slice(array_values(array_filter($scenarios, 'is_array')), 0, 3);
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
