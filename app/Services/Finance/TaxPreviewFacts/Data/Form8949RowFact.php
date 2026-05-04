<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use App\Services\Finance\CapitalGains\Form8949ReportRow;
use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form8949RowFact
{
    public function __construct(
        public ?string $form8949Box,
        public string $description,
        public ?string $dateAcquired,
        public string $dateSold,
        public float $proceeds,
        public float $costBasis,
        public ?string $adjustmentCode,
        public float $adjustmentAmount,
        public float $gainOrLoss,
        public bool $isShortTerm,
        public ?bool $isCovered,
        public bool $isSummaryRow,
        public ?string $accountName,
        public ?int $taxDocumentId,
        public ?string $sourceTransactionId,
    ) {}

    public static function fromReportRow(Form8949ReportRow $row): self
    {
        return new self(
            form8949Box: $row->form8949Box,
            description: $row->description,
            dateAcquired: $row->dateAcquired,
            dateSold: $row->dateSold,
            proceeds: round($row->proceeds, 2),
            costBasis: round($row->costBasis, 2),
            adjustmentCode: $row->adjustmentCode,
            adjustmentAmount: round($row->adjustmentAmount, 2),
            gainOrLoss: round($row->gainOrLoss, 2),
            isShortTerm: $row->isShortTerm,
            isCovered: $row->isCovered,
            isSummaryRow: $row->isSummaryRow,
            accountName: $row->accountName,
            taxDocumentId: $row->taxDocumentId,
            sourceTransactionId: $row->sourceTransactionId,
        );
    }

    /**
     * @return array{form8949Box:?string,description:string,dateAcquired:?string,dateSold:string,proceeds:float,costBasis:float,adjustmentCode:?string,adjustmentAmount:float,gainOrLoss:float,isShortTerm:bool,isCovered:?bool,isSummaryRow:bool,accountName:?string,taxDocumentId:?int,sourceTransactionId:?string}
     */
    public function toArray(): array
    {
        return [
            'form8949Box' => $this->form8949Box,
            'description' => $this->description,
            'dateAcquired' => $this->dateAcquired,
            'dateSold' => $this->dateSold,
            'proceeds' => $this->proceeds,
            'costBasis' => $this->costBasis,
            'adjustmentCode' => $this->adjustmentCode,
            'adjustmentAmount' => $this->adjustmentAmount,
            'gainOrLoss' => $this->gainOrLoss,
            'isShortTerm' => $this->isShortTerm,
            'isCovered' => $this->isCovered,
            'isSummaryRow' => $this->isSummaryRow,
            'accountName' => $this->accountName,
            'taxDocumentId' => $this->taxDocumentId,
            'sourceTransactionId' => $this->sourceTransactionId,
        ];
    }
}
