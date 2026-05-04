<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use App\Services\Finance\CapitalGains\WashSaleAdjustment;
use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class WashSaleAdjustmentFact
{
    public function __construct(
        public string $id,
        public string $lossSaleId,
        public string $replacementPurchaseId,
        public string $symbol,
        public string $saleDate,
        public string $replacementDate,
        public float $disallowedLoss,
        public ?int $saleAccountId,
        public ?string $saleAccountName,
        public ?int $replacementAccountId,
        public ?string $replacementAccountName,
        public bool $isCrossAccount,
        public string $reason,
        public ?int $saleLotId,
        public ?int $replacementLotId,
        public string $detectionNote,
    ) {}

    public static function fromAdjustment(WashSaleAdjustment $adjustment): self
    {
        return new self(
            id: $adjustment->id,
            lossSaleId: $adjustment->lossSaleId,
            replacementPurchaseId: $adjustment->replacementPurchaseId,
            symbol: $adjustment->symbol,
            saleDate: $adjustment->saleDateStr,
            replacementDate: $adjustment->replacementDateStr,
            disallowedLoss: round($adjustment->disallowedLoss, 2),
            saleAccountId: $adjustment->saleAccountId,
            saleAccountName: $adjustment->saleAccountName,
            replacementAccountId: $adjustment->replacementAccountId,
            replacementAccountName: $adjustment->replacementAccountName,
            isCrossAccount: $adjustment->isCrossAccount,
            reason: $adjustment->reason,
            saleLotId: $adjustment->saleLotId,
            replacementLotId: $adjustment->replacementLotId,
            detectionNote: $adjustment->detectionNote,
        );
    }

    /**
     * @return array{id:string,lossSaleId:string,replacementPurchaseId:string,symbol:string,saleDate:string,replacementDate:string,disallowedLoss:float,saleAccountId:?int,saleAccountName:?string,replacementAccountId:?int,replacementAccountName:?string,isCrossAccount:bool,reason:string,saleLotId:?int,replacementLotId:?int,detectionNote:string}
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'lossSaleId' => $this->lossSaleId,
            'replacementPurchaseId' => $this->replacementPurchaseId,
            'symbol' => $this->symbol,
            'saleDate' => $this->saleDate,
            'replacementDate' => $this->replacementDate,
            'disallowedLoss' => $this->disallowedLoss,
            'saleAccountId' => $this->saleAccountId,
            'saleAccountName' => $this->saleAccountName,
            'replacementAccountId' => $this->replacementAccountId,
            'replacementAccountName' => $this->replacementAccountName,
            'isCrossAccount' => $this->isCrossAccount,
            'reason' => $this->reason,
            'saleLotId' => $this->saleLotId,
            'replacementLotId' => $this->replacementLotId,
            'detectionNote' => $this->detectionNote,
        ];
    }
}
