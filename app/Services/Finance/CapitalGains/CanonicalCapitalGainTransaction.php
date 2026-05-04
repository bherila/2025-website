<?php

namespace App\Services\Finance\CapitalGains;

/**
 * Canonical representation of a capital gain/loss transaction.
 *
 * Normalises data from three sources — imported 1099-B lots, in-system account
 * lots, and LotAnalyzer-derived rows — into a single shape that the
 * WashSaleAnalysisEngine, Form8949ReportBuilder, and reconciliation views can
 * all consume without knowing the original source.
 */
class CanonicalCapitalGainTransaction
{
    public function __construct(
        /** Unique stable identifier (lot_id, prefixed by source, e.g. "lot:42" or "1099b:7") */
        public readonly string $id,
        /** Source of this transaction: '1099b', 'account_lot', or 'analyzer' */
        public readonly string $source,
        /** Security ticker symbol */
        public readonly ?string $symbol,
        /** IRS Form 8949 description — col (a) */
        public readonly string $description,
        /** CUSIP identifier, when known */
        public readonly ?string $cusip,
        /** Number of shares/units */
        public readonly float $quantity,
        /** Acquisition date ("YYYY-MM-DD" or "various" for aggregated lots) */
        public readonly ?string $dateAcquired,
        /** Disposition date ("YYYY-MM-DD") */
        public readonly string $dateSold,
        /** Sales proceeds — col (d) */
        public readonly float $proceeds,
        /** Cost or other basis — col (e) */
        public readonly float $costBasis,
        /** Wash sale loss disallowed — col (g), positive amount */
        public readonly float $washSaleDisallowed,
        /** Realized gain/loss — col (h) */
        public readonly float $realizedGainLoss,
        /** true = short-term, false = long-term, null = unknown */
        public readonly ?bool $isShortTerm,
        /** IRS Form 8949 box (A–F) or null when unknown */
        public readonly ?string $form8949Box,
        /** Whether this is a covered transaction */
        public readonly ?bool $isCovered,
        /** Accrued market discount, when applicable */
        public readonly ?float $accruedMarketDiscount,
        /** Account ID, when available */
        public readonly ?int $accountId,
        /** Account display name, when available */
        public readonly ?string $accountName,
        /** Tax document ID this came from, when applicable */
        public readonly ?int $taxDocumentId,
        /** Internal lot_id from fin_account_lots, when applicable */
        public readonly ?int $lotId,
        /** Internal transaction ID of the closing (sell) transaction, when available */
        public readonly ?int $closeTransactionId,
    ) {}
}
