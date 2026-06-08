<?php

namespace App\Services\Planning\CareerComp;

final readonly class ModelAssumptions
{
    private const array DEFAULT_COMMON_FMV_PCT_OF_PREFERRED = [
        'stageA' => 15.0,
        'stageB' => 25.0,
        'stageC' => 40.0,
        'bridge' => 50.0,
        'stageD' => 65.0,
        'stageE' => 80.0,
        'liquidityEvent' => 100.0,
    ];

    /**
     * @param  array<string, mixed>  $values
     */
    private function __construct(private array $values) {}

    /**
     * @param  array<string, mixed>|null  $values
     */
    public static function fromArray(?array $values): self
    {
        return new self(array_replace_recursive(self::defaults(), self::withoutNulls($values ?? [])));
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'commonFmvPctOfPreferred' => self::DEFAULT_COMMON_FMV_PCT_OF_PREFERRED,
            'tax' => [
                'filingStatus' => 'single',
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

    public function isMarried(): bool
    {
        return $this->filingStatus() === 'mfj';
    }

    public function filingStatus(): string
    {
        $value = $this->value('tax.filingStatus');

        return $value === 'mfj' ? 'mfj' : 'single';
    }

    public function commonFmvPctForStage(?string $stage, bool $liquidityEvent): float
    {
        return $this->number('commonFmvPctOfPreferred.'.$this->commonFmvStageKey($stage, $liquidityEvent));
    }

    /**
     * Maps a funding-stage label to its common-FMV bucket. The frontend mirrors this in
     * resources/js/components/planning/CareerComp/CareerCompForm.tsx (`stageAssumptionKey`)
     * to render the benchmark hint; keep the two heuristics in sync.
     */
    private function commonFmvStageKey(?string $stage, bool $liquidityEvent): string
    {
        if ($liquidityEvent) {
            return 'liquidityEvent';
        }

        $tokens = preg_split('/[^a-z0-9]+/', strtolower(trim((string) $stage)), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if (in_array('ipo', $tokens, true) || in_array('exit', $tokens, true) || in_array('liquidity', $tokens, true)) {
            return 'liquidityEvent';
        }

        if (in_array('bridge', $tokens, true) || (in_array('no', $tokens, true) && in_array('raise', $tokens, true))) {
            return 'bridge';
        }

        foreach (['e', 'd', 'c', 'b', 'a'] as $stageLetter) {
            if (in_array($stageLetter, $tokens, true) || in_array('stage'.$stageLetter, $tokens, true)) {
                return 'stage'.strtoupper($stageLetter);
            }
        }

        return 'stageA';
    }

    private function number(string $path): float
    {
        $value = $this->value($path);

        return is_numeric($value) ? max(0.0, min(100.0, (float) $value)) : 0.0;
    }

    private function value(string $path): mixed
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
