<?php

namespace App\Services\ClientManagement\DataTransferObjects;

use App\Services\ClientManagement\ClientInvoicingService;

/**
 * Net retainer balance for an invoice period after applying any overage
 * payoffs from catch-up billing.
 *
 * Returned by {@see ClientInvoicingService::calculateCumulativeBalanceSnapshot()}.
 */
readonly class BalanceSnapshot
{
    public function __construct(
        public float $unused,
        public float $negative,
    ) {}

    public static function zero(): self
    {
        return new self(unused: 0.0, negative: 0.0);
    }
}
