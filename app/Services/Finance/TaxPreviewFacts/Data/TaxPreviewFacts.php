<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class TaxPreviewFacts
{
    public function __construct(
        public int $year,
        public Schedule1Facts $schedule1,
        public Form4952Facts $form4952,
    ) {}

    /**
     * @return array{year:int,schedule1:array<string,mixed>,form4952:array<string,mixed>}
     */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'schedule1' => $this->schedule1->toArray(),
            'form4952' => $this->form4952->toArray(),
        ];
    }
}
