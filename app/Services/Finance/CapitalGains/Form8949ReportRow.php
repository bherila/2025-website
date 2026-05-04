<?php

namespace App\Services\Finance\CapitalGains;

/**
 * One row (or summary block) in a Form 8949 report.
 *
 * When $isSummaryRow is true the row aggregates multiple underlying
 * transactions into a single Schedule D line-entry equivalent.
 * When false it is a single discrete transaction.
 */
class Form8949ReportRow
{
    public function __construct(
        /** IRS Form 8949 box (A–F) that governs this row */
        public readonly string $form8949Box,
        /** Description — col (a) of the underlying transaction(s) */
        public readonly string $description,
        /** Date acquired — col (b), may be "various" */
        public readonly ?string $dateAcquired,
        /** Date sold/disposed — col (c) */
        public readonly string $dateSold,
        /** Proceeds — col (d) */
        public readonly float $proceeds,
        /** Cost or other basis — col (e) */
        public readonly float $costBasis,
        /** Adjustment code(s) — col (f) */
        public readonly ?string $adjustmentCode,
        /** Adjustment amount — col (g), positive = disallowance, negative = addition */
        public readonly float $adjustmentAmount,
        /** Gain or loss — col (h) = proceeds − costBasis + adjustmentAmount */
        public readonly float $gainOrLoss,
        /** Whether this represents a short-term gain/loss */
        public readonly bool $isShortTerm,
        /** Whether this is a broker-covered transaction */
        public readonly ?bool $isCovered,
        /** true when this row is a summary of multiple transactions */
        public readonly bool $isSummaryRow,
        /** Account name, for multi-account views */
        public readonly ?string $accountName,
        /** Tax document ID that sourced this row */
        public readonly ?int $taxDocumentId,
        /** Canonical transaction ID(s) that make up this row */
        public readonly ?string $sourceTransactionId,
    ) {}
}
