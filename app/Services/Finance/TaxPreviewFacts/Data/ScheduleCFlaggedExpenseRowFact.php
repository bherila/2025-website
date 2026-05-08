<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class ScheduleCFlaggedExpenseRowFact
{
    public function __construct(
        public int $transactionId,
        public string $date,
        public ?string $description,
        public float $amount,
        public ?int $accountId,
        public string $taxCharacteristic,
        public string $label,
        public string $category,
        public string $reason,
    ) {}

    /**
     * @return array{transactionId:int,date:string,description:?string,amount:float,accountId:?int,taxCharacteristic:string,label:string,category:string,reason:string}
     */
    public function toArray(): array
    {
        return [
            'transactionId' => $this->transactionId,
            'date' => $this->date,
            'description' => $this->description,
            'amount' => $this->amount,
            'accountId' => $this->accountId,
            'taxCharacteristic' => $this->taxCharacteristic,
            'label' => $this->label,
            'category' => $this->category,
            'reason' => $this->reason,
        ];
    }
}
