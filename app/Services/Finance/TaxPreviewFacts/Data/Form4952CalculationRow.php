<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form4952CalculationRow
{
    public function __construct(
        public string $label,
        public float $amount,
        public string $role = 'input',
        public ?string $note = null,
    ) {}

    /**
     * @return array{label:string,amount:float,role:string,note:?string}
     */
    public function toArray(): array
    {
        return [
            'label' => $this->label,
            'amount' => $this->amount,
            'role' => $this->role,
            'note' => $this->note,
        ];
    }
}
