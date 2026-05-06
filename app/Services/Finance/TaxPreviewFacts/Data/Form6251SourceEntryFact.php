<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form6251SourceEntryFact
{
    public function __construct(
        public string $label,
        public string $code,
        public string $line,
        public float $amount,
        public string $description,
        public bool $requiresStatementReview = false,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'label' => $this->label,
            'code' => $this->code,
            'line' => $this->line,
            'amount' => $this->amount,
            'description' => $this->description,
            'requiresStatementReview' => $this->requiresStatementReview,
        ];
    }
}
