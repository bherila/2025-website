<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

/**
 * A single reconciliation candidate derived from an account transaction or statement that looks
 * like a partnership contribution or distribution. Candidates are read-only suggestions for the
 * partner to review; they never adjust outside basis on their own.
 */
#[TypeScript]
readonly class PartnershipBasisReconciliationItem
{
    public function __construct(
        public string $id,
        public string $kind,
        public ?string $date,
        public ?string $description,
        public float $amount,
        public string $suggestedEventType,
        public ?int $lineItemId,
        public ?int $statementId,
        public ?int $statementInvestmentId,
        public string $reviewStatus = 'needs_review',
    ) {}

    /**
     * @return array{id:string,kind:string,date:?string,description:?string,amount:float,suggestedEventType:string,lineItemId:?int,statementId:?int,statementInvestmentId:?int,reviewStatus:string}
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'date' => $this->date,
            'description' => $this->description,
            'amount' => $this->amount,
            'suggestedEventType' => $this->suggestedEventType,
            'lineItemId' => $this->lineItemId,
            'statementId' => $this->statementId,
            'statementInvestmentId' => $this->statementInvestmentId,
            'reviewStatus' => $this->reviewStatus,
        ];
    }
}
