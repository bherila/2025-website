<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class TaxPreviewTransaction
{
    public function __construct(
        public int $transactionId,
        public string $date,
        public ?string $description,
        public float $amount,
        public ?int $accountId,
    ) {}

    /**
     * @return array{transactionId:int,date:string,description:?string,amount:float,accountId:?int}
     */
    public function toArray(): array
    {
        return [
            'transactionId' => $this->transactionId,
            'date' => $this->date,
            'description' => $this->description,
            'amount' => $this->amount,
            'accountId' => $this->accountId,
        ];
    }
}
