<?php

namespace App\Services\Finance;

class Form8949ExportLot
{
    public function __construct(
        public string $description,
        public ?string $dateAcquired,
        public string $dateSold,
        public float $proceeds,
        public float $costBasis,
        public float $adjustmentAmount,
        public ?string $adjustmentCode,
        public bool $isShortTerm,
        public string $form8949Box,
        public ?float $quantity = null,
        public ?string $symbol = null,
        public ?string $accountName = null,
        public ?string $payerName = null,
        public ?string $payerTin = null,
        public ?bool $isCovered = null,
        public ?float $accruedMarketDiscount = null,
        public ?float $washSaleDisallowed = null,
        public ?float $federalIncomeTaxWithheld = null,
    ) {}
}
