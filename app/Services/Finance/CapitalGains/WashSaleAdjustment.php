<?php

namespace App\Services\Finance\CapitalGains;

/**
 * A canonical wash-sale adjustment record.
 *
 * Represents a detected wash-sale event at the taxpayer level — either
 * same-account (broker-reported) or cross-account (taxpayer-level fact not
 * captured on any single 1099-B).
 */
class WashSaleAdjustment
{
    private const SYMBOL_MATCH_NOTE = 'Matched by normalized ticker symbol. Review manually for other substantially identical securities such as options, share classes, or paired funds.';

    public function __construct(
        /** Stable identifier for this adjustment, e.g. "ws:lot:42:lot:99" */
        public readonly string $id,
        /** The canonical transaction ID of the loss sale that is disallowed */
        public readonly string $lossSaleId,
        /** The canonical transaction ID of the replacement purchase */
        public readonly string $replacementPurchaseId,
        /** Symbol of the sold security */
        public readonly string $symbol,
        /** Date the loss sale occurred ("YYYY-MM-DD") */
        public readonly string $saleDateStr,
        /** Date of the replacement purchase ("YYYY-MM-DD") */
        public readonly string $replacementDateStr,
        /** Disallowed loss amount (positive number) */
        public readonly float $disallowedLoss,
        /** Account ID of the loss sale */
        public readonly ?int $saleAccountId,
        /** Account name of the loss sale */
        public readonly ?string $saleAccountName,
        /** Account ID of the replacement purchase (may differ for cross-account) */
        public readonly ?int $replacementAccountId,
        /** Account name of the replacement purchase */
        public readonly ?string $replacementAccountName,
        /**
         * true  = different accounts are involved (taxpayer-level, not on 1099-B)
         * false = same account (may already appear on 1099-B)
         */
        public readonly bool $isCrossAccount,
        /** Human-readable explanation of the wash-sale rule applied */
        public readonly string $reason,
        /** Lot_id of the loss-sale lot in fin_account_lots, when applicable */
        public readonly ?int $saleLotId,
        /** Lot_id of the replacement lot in fin_account_lots, when applicable */
        public readonly ?int $replacementLotId,
        /** Detection scope and limitations for the match heuristic */
        public readonly string $detectionNote = self::SYMBOL_MATCH_NOTE,
    ) {}
}
