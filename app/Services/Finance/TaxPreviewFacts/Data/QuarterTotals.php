<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class QuarterTotals
{
    public function __construct(
        public float $q1,
        public float $q2,
        public float $q3,
        public float $q4,
    ) {}

    public static function empty(): self
    {
        return new self(q1: 0.0, q2: 0.0, q3: 0.0, q4: 0.0);
    }

    /**
     * @return array{q1:float,q2:float,q3:float,q4:float}
     */
    public function toArray(): array
    {
        return [
            'q1' => $this->q1,
            'q2' => $this->q2,
            'q3' => $this->q3,
            'q4' => $this->q4,
        ];
    }
}
