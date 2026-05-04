<?php

namespace App\Services\Finance\CapitalGains;

/**
 * Result of matching one 1099-B entry against in-system lots/transactions.
 *
 * Produced by TaxLotReconciliationEngine for each imported entry.
 */
class CapitalGainReconciliationResult
{
    /**
     * @param  CanonicalCapitalGainTransaction[]  $candidateTransactions  All candidate lots (useful for 'duplicate')
     */
    public function __construct(
        /**
         * Match confidence:
         *   'matched'         — all tax values agree within tolerances
         *   'variance'        — same disposition but tax values differ
         *   'missing_account' — 1099-B entry has no matching system lot
         *   'missing_1099b'   — system lot has no matching 1099-B entry
         *   'duplicate'       — 1099-B entry matches more than one system lot
         */
        public readonly string $status,
        /** The 1099-B imported entry, or null for 'missing_1099b' rows */
        public readonly ?CanonicalCapitalGainTransaction $reportedTransaction,
        /** The best-matching system lot, or null for 'missing_account' rows */
        public readonly ?CanonicalCapitalGainTransaction $accountTransaction,
        /** All system lots that were candidate matches (useful for 'duplicate') */
        public readonly array $candidateTransactions,
        /** Proceeds delta (account − reported), null when one side is missing */
        public readonly ?float $proceedsDelta,
        /** Cost-basis delta (account − reported) */
        public readonly ?float $costBasisDelta,
        /** Realized-gain delta (account − reported) */
        public readonly ?float $realizedGainDelta,
    ) {}
}
