<?php

namespace App\Services\ClientManagement\DataTransferObjects;

readonly class MonthSummary
{
    public function __construct(
        public OpeningBalance $opening,
        public ClosingBalance $closing,
        public float $hoursWorked,
        public string $yearMonth,
        public float $retainerHours,
    ) {}
}
