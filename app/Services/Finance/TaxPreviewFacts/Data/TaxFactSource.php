<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class TaxFactSource
{
    public function __construct(
        public string $id,
        public string $label,
        public float $amount,
        public string $sourceType,
        public ?int $taxDocumentId = null,
        public ?int $taxDocumentAccountId = null,
        public ?int $accountId = null,
        public ?string $formType = null,
        public ?string $box = null,
        public ?string $code = null,
        public ?string $routing = null,
        public ?string $routingReason = null,
        public ?string $notes = null,
        public bool $isReviewed = true,
        public string $reviewStatus = 'reviewed',
        public ?string $reviewAction = null,
    ) {}

    /**
     * @return array{id:string,label:string,amount:float,sourceType:string,taxDocumentId:?int,taxDocumentAccountId:?int,accountId:?int,formType:?string,box:?string,code:?string,routing:?string,routingReason:?string,notes:?string,isReviewed:bool,reviewStatus:string,reviewAction:?string}
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'amount' => $this->amount,
            'sourceType' => $this->sourceType,
            'taxDocumentId' => $this->taxDocumentId,
            'taxDocumentAccountId' => $this->taxDocumentAccountId,
            'accountId' => $this->accountId,
            'formType' => $this->formType,
            'box' => $this->box,
            'code' => $this->code,
            'routing' => $this->routing,
            'routingReason' => $this->routingReason,
            'notes' => $this->notes,
            'isReviewed' => $this->isReviewed,
            'reviewStatus' => $this->reviewStatus,
            'reviewAction' => $this->reviewAction,
        ];
    }
}
