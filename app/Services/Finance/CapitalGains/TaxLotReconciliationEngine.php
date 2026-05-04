<?php

namespace App\Services\Finance\CapitalGains;

use App\Services\Finance\TaxLotReconciliationService;

/**
 * Shared reconciliation engine that wraps TaxLotReconciliationService and
 * exposes results as canonical CapitalGainReconciliationResult objects.
 *
 * This is the single entry point for reconciling 1099-B imports against
 * in-system lots, used by both Tax Preview's Capital Gains Reconciliation
 * workflow and any future tooling.
 */
class TaxLotReconciliationEngine
{
    public function __construct(
        private readonly TaxLotReconciliationService $reconciliationService,
    ) {}

    /**
     * Reconcile 1099-B imports against in-system lots for a user/year.
     *
     * Returns the raw reconciliation payload from TaxLotReconciliationService;
     * callers can further map rows to CapitalGainReconciliationResult via
     * toReconciliationResult() when needed.
     *
     * @return array{
     *     tax_year: int,
     *     summary: array<string, int>,
     *     accounts: array<int, array<string, mixed>>,
     *     unresolved_account_links: array<int, array<string, mixed>>
     * }
     */
    public function reconcile(int $userId, int $taxYear, ?int $accountId = null): array
    {
        return $this->reconciliationService->reconcile($userId, $taxYear, $accountId);
    }

    /**
     * Map a raw row array from TaxLotReconciliationService into a
     * CapitalGainReconciliationResult.
     *
     * @param  array<string, mixed>  $row  A single row from accounts[n]['rows']
     */
    public function toReconciliationResult(array $row): CapitalGainReconciliationResult
    {
        $status = is_string($row['status']) ? $row['status'] : 'missing_account';

        $reported = is_array($row['reported_lot'] ?? null) ? $this->rowToCanonical($row['reported_lot'], '1099b') : null;
        $account = is_array($row['account_lot'] ?? null) ? $this->rowToCanonical($row['account_lot'], 'account_lot') : null;
        $candidates = array_map(
            fn (array $c): CanonicalCapitalGainTransaction => $this->rowToCanonical($c, 'account_lot'),
            is_array($row['candidate_lots'] ?? null) ? $row['candidate_lots'] : [],
        );

        $deltas = is_array($row['deltas'] ?? null) ? $row['deltas'] : [];

        return new CapitalGainReconciliationResult(
            status: $status,
            reportedTransaction: $reported,
            accountTransaction: $account,
            candidateTransactions: $candidates,
            proceedsDelta: is_numeric($deltas['proceeds'] ?? null) ? (float) $deltas['proceeds'] : null,
            costBasisDelta: is_numeric($deltas['cost_basis'] ?? null) ? (float) $deltas['cost_basis'] : null,
            realizedGainDelta: is_numeric($deltas['realized_gain_loss'] ?? null) ? (float) $deltas['realized_gain_loss'] : null,
        );
    }

    // -------------------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $lotRow
     */
    private function rowToCanonical(array $lotRow, string $source): CanonicalCapitalGainTransaction
    {
        $lotId = is_numeric($lotRow['lot_id'] ?? null) ? (int) $lotRow['lot_id'] : null;
        $id = $lotId !== null ? "{$source}:{$lotId}" : "{$source}:".uniqid();

        return new CanonicalCapitalGainTransaction(
            id: $id,
            source: $source,
            symbol: is_string($lotRow['symbol'] ?? null) ? $lotRow['symbol'] : null,
            description: is_string($lotRow['description'] ?? null) ? $lotRow['description'] : '',
            cusip: is_string($lotRow['cusip'] ?? null) ? $lotRow['cusip'] : null,
            quantity: is_numeric($lotRow['quantity'] ?? null) ? (float) $lotRow['quantity'] : 0.0,
            dateAcquired: is_string($lotRow['purchase_date'] ?? null) ? $lotRow['purchase_date'] : null,
            dateSold: is_string($lotRow['sale_date'] ?? null) ? $lotRow['sale_date'] : '',
            proceeds: is_numeric($lotRow['proceeds'] ?? null) ? (float) $lotRow['proceeds'] : 0.0,
            costBasis: is_numeric($lotRow['cost_basis'] ?? null) ? (float) $lotRow['cost_basis'] : 0.0,
            washSaleDisallowed: is_numeric($lotRow['wash_sale_disallowed'] ?? null) ? (float) $lotRow['wash_sale_disallowed'] : 0.0,
            realizedGainLoss: is_numeric($lotRow['realized_gain_loss'] ?? null) ? (float) $lotRow['realized_gain_loss'] : 0.0,
            isShortTerm: isset($lotRow['is_short_term']) ? (bool) $lotRow['is_short_term'] : null,
            form8949Box: is_string($lotRow['form_8949_box'] ?? null) ? $lotRow['form_8949_box'] : null,
            isCovered: isset($lotRow['is_covered']) ? (bool) $lotRow['is_covered'] : null,
            accruedMarketDiscount: is_numeric($lotRow['accrued_market_discount'] ?? null) ? (float) $lotRow['accrued_market_discount'] : null,
            accountId: is_numeric($lotRow['acct_id'] ?? null) ? (int) $lotRow['acct_id'] : null,
            accountName: null,
            taxDocumentId: is_numeric($lotRow['tax_document_id'] ?? null) ? (int) $lotRow['tax_document_id'] : null,
            lotId: $lotId,
            closeTransactionId: is_numeric($lotRow['close_t_id'] ?? null) ? (int) $lotRow['close_t_id'] : null,
        );
    }
}
