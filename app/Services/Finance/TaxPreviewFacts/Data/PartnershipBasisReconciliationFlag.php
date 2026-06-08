<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

/**
 * A comparison between a basis-layer figure and an observed transaction/statement figure. Status is
 * 'match' when the two agree within tolerance, 'mismatch' when they diverge, or 'info' for
 * reconciliation-only context (book/FMV capital, inside-basis proxy) that never drives outside basis.
 */
#[TypeScript]
readonly class PartnershipBasisReconciliationFlag
{
    public const STATUS_MATCH = 'match';

    public const STATUS_MISMATCH = 'mismatch';

    public const STATUS_INFO = 'info';

    public function __construct(
        public string $key,
        public string $label,
        public string $status,
        public float $expected,
        public float $observed,
        public float $difference,
        public string $detail,
    ) {}

    /**
     * @return array{key:string,label:string,status:string,expected:float,observed:float,difference:float,detail:string}
     */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'label' => $this->label,
            'status' => $this->status,
            'expected' => $this->expected,
            'observed' => $this->observed,
            'difference' => $this->difference,
            'detail' => $this->detail,
        ];
    }
}
