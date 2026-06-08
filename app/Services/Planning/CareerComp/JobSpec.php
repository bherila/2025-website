<?php

namespace App\Services\Planning\CareerComp;

final readonly class JobSpec
{
    /**
     * @param  array<string, mixed>  $values
     */
    private function __construct(private array $values, private bool $current) {}

    /**
     * @param  array<string, mixed>|null  $values
     */
    public static function nullableFromArray(?array $values, bool $isCurrent): ?self
    {
        if ($values === null || self::isEmpty($values)) {
            return null;
        }

        return new self(array_replace_recursive(self::defaults($isCurrent), $values), $isCurrent);
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(bool $isCurrent = false): array
    {
        return [
            'id' => $isCurrent ? 'current' : 'job',
            'name' => $isCurrent ? 'Current role' : 'Opportunity',
            'startDate' => null,
            'priorJobResignationDate' => null,
            'transitionOverride' => [
                'currentJobNoticeWeeks' => null,
                'timeOffBetweenJobsWeeks' => null,
            ],
            'retainedCurrentJobIds' => [],
            'company' => [
                'type' => 'public',
                'currentSharePrice' => 0.0,
                'fourNineA' => 0.0,
                'fullyDilutedShares' => 0.0,
                'annualDilutionPct' => 0.0,
                'liquidityDate' => null,
                'valuationScenarios' => [],
            ],
            'comp' => [
                'baseSalary' => 0.0,
                'cashBonus' => 0.0,
                // Compounding annual raise applied to base + bonus (0 = no raise).
                'annualRaisePct' => 0.0,
            ],
            'grantTypes' => [
                'rsu' => true,
                'options' => true,
            ],
            // Projected refreshers are computed inline during reads. That adds compute latency, but it
            // keeps saved comparisons compact and lets projections immediately reflect company inputs.
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
            'optionGrants' => [],
            'growthBands' => [
                'lowPct' => 0.0,
                'mediumPct' => 0.0,
                'highPct' => 0.0,
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

    public function id(): string
    {
        return (string) $this->value('id');
    }

    public function name(): string
    {
        return (string) $this->value('name');
    }

    public function isCurrent(): bool
    {
        return $this->current;
    }

    public function companyType(): string
    {
        return (string) $this->value('company.type') === 'private' ? 'private' : 'public';
    }

    public function isPrivate(): bool
    {
        return $this->companyType() === 'private';
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

    public function bool(string $path): bool
    {
        return filter_var($this->value($path), FILTER_VALIDATE_BOOL);
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
     * @return list<array<string, mixed>>
     */
    public function rsuGrants(): array
    {
        if (! $this->grantsRsu()) {
            return [];
        }

        $grants = $this->value('rsuGrants');

        return is_array($grants) ? array_values(array_filter($grants, 'is_array')) : [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function optionGrants(): array
    {
        if (! $this->grantsOptions()) {
            return [];
        }

        $grants = $this->value('optionGrants');

        return is_array($grants) ? array_values(array_filter($grants, 'is_array')) : [];
    }

    public function grantsRsu(): bool
    {
        return filter_var($this->value('grantTypes.rsu'), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? true;
    }

    public function grantsOptions(): bool
    {
        return filter_var($this->value('grantTypes.options'), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? true;
    }

    /**
     * @return list<string>
     */
    public function retainedCurrentJobIds(): array
    {
        $ids = $this->value('retainedCurrentJobIds');
        if (! is_array($ids)) {
            return [];
        }

        $strings = array_filter(array_map(
            static fn (mixed $id): string => trim((string) $id),
            $ids,
        ), static fn (string $id): bool => $id !== '');

        return array_values(array_unique($strings));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function valuationScenarios(): array
    {
        $scenarios = $this->value('company.valuationScenarios');

        return is_array($scenarios) ? array_values(array_filter($scenarios, 'is_array')) : [];
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private static function isEmpty(array $values): bool
    {
        $hasIdentity = trim((string) ($values['id'] ?? '')) !== '' || trim((string) ($values['name'] ?? '')) !== '';
        $comp = is_array($values['comp'] ?? null) ? $values['comp'] : [];
        $hasCash = (float) ($comp['baseSalary'] ?? 0) !== 0.0 || (float) ($comp['cashBonus'] ?? 0) !== 0.0;
        $hasEquity = (is_array($values['rsuGrants'] ?? null) && $values['rsuGrants'] !== [])
            || (is_array($values['optionGrants'] ?? null) && $values['optionGrants'] !== []);

        return ! $hasIdentity && ! $hasCash && ! $hasEquity;
    }
}
