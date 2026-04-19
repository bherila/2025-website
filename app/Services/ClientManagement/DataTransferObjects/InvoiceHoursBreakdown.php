<?php

namespace App\Services\ClientManagement\DataTransferObjects;

readonly class InvoiceHoursBreakdown
{
    public function __construct(
        public float $carriedInHours,
        public float $currentMonthHours,
    ) {}
}
