<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;

/**
 * Converts heterogeneous capital-gain data sources into a uniform
 * CanonicalCapitalGainTransaction shape.
 *
 * Supported sources:
 *   • fin_account_lots rows (account_lot / 1099b lot_source)
 *   • TaxDocumentAccount parsed_data transactions (broker 1099-B AI-parsed)
 */
class CapitalGainsImportNormalizer
{
    public function __construct(
        private readonly BrokerWashSaleTreatmentNormalizer $washSaleTreatmentNormalizer,
        private readonly WashSaleTreatmentApplier $washSaleTreatmentApplier = new WashSaleTreatmentApplier,
    ) {}

    /**
     * Convert a FinAccountLot to a CanonicalCapitalGainTransaction.
     *
     * Works for both "account_lot" rows and "1099b"-sourced rows — callers
     * should inspect $lot->lot_source to distinguish them if needed.
     */
    public function fromAccountLot(FinAccountLot $lot): CanonicalCapitalGainTransaction
    {
        $source = in_array($lot->lot_source, [FinAccountLot::SOURCE_1099B, FinAccountLot::SOURCE_1099B_UNDERSCORE], true)
            ? '1099b'
            : 'account_lot';

        $account = $lot->account;
        $accountName = $account instanceof FinAccounts ? (string) $account->acct_name : null;
        $taxDocument = $lot->taxDocument;
        $treatment = $taxDocument instanceof FileForTaxDocument
            ? $this->washSaleTreatmentApplier->resolveForDocument($taxDocument)
            : null;

        return new CanonicalCapitalGainTransaction(
            id: "{$source}:{$lot->lot_id}",
            source: $source,
            symbol: $lot->symbol,
            description: $lot->description ?? $lot->symbol ?? '',
            cusip: $lot->cusip,
            quantity: (float) $lot->quantity,
            dateAcquired: $this->dateStr($lot->purchase_date),
            dateSold: $this->dateStr($lot->sale_date) ?? '',
            proceeds: (float) ($lot->proceeds ?? 0),
            costBasis: (float) ($lot->cost_basis ?? 0),
            washSaleDisallowed: (float) ($lot->wash_sale_disallowed ?? 0),
            realizedGainLoss: (float) ($lot->realized_gain_loss ?? 0),
            isShortTerm: $lot->is_short_term,
            form8949Box: $lot->form_8949_box,
            isCovered: $lot->is_covered,
            accruedMarketDiscount: $lot->accrued_market_discount !== null ? (float) $lot->accrued_market_discount : null,
            accountId: (int) $lot->acct_id,
            accountName: $accountName,
            taxDocumentId: $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : null,
            lotId: (int) $lot->lot_id,
            closeTransactionId: $lot->close_t_id !== null ? (int) $lot->close_t_id : null,
            washSaleTreatment: $treatment,
        );
    }

    /**
     * Convert a raw AI-parsed 1099-B transaction array from TaxDocumentAccount
     * parsed_data into a CanonicalCapitalGainTransaction.
     *
     * @param  array<string, mixed>  $transaction  One element from parsed_data[n].transactions
     * @param  TaxDocumentAccount  $link  The account link that owns this transaction entry
     */
    public function fromParsedTransaction(array $transaction, TaxDocumentAccount $link): CanonicalCapitalGainTransaction
    {
        $symbol = is_string($transaction['symbol'] ?? null) ? $transaction['symbol'] : null;
        $description = is_string($transaction['description'] ?? null) ? $transaction['description'] : ($symbol ?? '');
        $cusip = is_string($transaction['cusip'] ?? null) ? $transaction['cusip'] : null;
        $purchaseDate = is_string($transaction['purchase_date'] ?? null) ? $transaction['purchase_date'] : null;
        $saleDate = is_string($transaction['sale_date'] ?? null) ? $transaction['sale_date'] : '';
        $quantity = is_numeric($transaction['quantity'] ?? null) ? (float) $transaction['quantity'] : 0.0;
        $proceeds = is_numeric($transaction['proceeds'] ?? null) ? (float) $transaction['proceeds'] : 0.0;
        $costBasis = is_numeric($transaction['cost_basis'] ?? null) ? (float) $transaction['cost_basis'] : 0.0;
        $washSale = is_numeric($transaction['wash_sale_disallowed'] ?? null) ? (float) $transaction['wash_sale_disallowed'] : 0.0;
        $reportedGainLoss = is_numeric($transaction['realized_gain_loss'] ?? null) ? (float) $transaction['realized_gain_loss'] : null;
        $washSaleAmounts = $this->washSaleTreatmentNormalizer->normalizeAmounts(
            proceeds: $proceeds,
            costBasis: $costBasis,
            reportedGainLoss: $reportedGainLoss,
            washSaleDisallowed: $washSale,
            treatment: $transaction['wash_sale_treatment'] ?? null,
        );
        $isShortTerm = isset($transaction['is_short_term']) ? (bool) $transaction['is_short_term'] : null;
        $form8949Box = is_string($transaction['form_8949_box'] ?? null) ? $transaction['form_8949_box'] : null;
        $isCovered = isset($transaction['is_covered']) ? (bool) $transaction['is_covered'] : null;
        $amd = is_numeric($transaction['accrued_market_discount'] ?? null) ? (float) $transaction['accrued_market_discount'] : null;

        $taxDocument = $link->taxDocument;
        $docId = $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : (int) $link->document_id;
        $acctId = $link->account_id !== null ? (int) $link->account_id : null;
        $linkAccount = $link->account;
        $acctName = $linkAccount instanceof FinAccounts
            ? (string) $linkAccount->acct_name
            : ($link->ai_account_name ?? null);
        $treatment = $taxDocument instanceof FileForTaxDocument
            ? $this->washSaleTreatmentApplier->resolveForDocument($taxDocument)
            : null;

        return new CanonicalCapitalGainTransaction(
            id: "parsed:{$docId}:{$link->id}:".md5($symbol.$saleDate.$proceeds),
            source: '1099b',
            symbol: $symbol,
            description: $description,
            cusip: $cusip,
            quantity: $quantity,
            dateAcquired: $purchaseDate,
            dateSold: $saleDate,
            proceeds: $proceeds,
            costBasis: $costBasis,
            washSaleDisallowed: $washSaleAmounts['wash_sale_disallowed'],
            realizedGainLoss: $washSaleAmounts['realized_gain_loss'],
            isShortTerm: $isShortTerm,
            form8949Box: $form8949Box,
            isCovered: $isCovered,
            accruedMarketDiscount: $amd,
            accountId: $acctId,
            accountName: $acctName,
            taxDocumentId: $docId,
            lotId: null,
            closeTransactionId: null,
            washSaleTreatment: $treatment,
        );
    }

    /**
     * Infer an IRS Form 8949 box from a canonical transaction when the explicit
     * box is missing.  Falls back to null if insufficient information.
     */
    public function inferForm8949Box(CanonicalCapitalGainTransaction $txn): ?string
    {
        if ($txn->form8949Box !== null) {
            return $txn->form8949Box;
        }

        $isShortTerm = $txn->isShortTerm ?? $this->inferShortTermFromDates($txn->dateAcquired, $txn->dateSold);
        if ($isShortTerm === null) {
            return null;
        }

        $isCovered = $txn->isCovered ?? true;

        if ($isShortTerm) {
            return $isCovered ? 'A' : 'B';
        }

        return $isCovered ? 'D' : 'E';
    }

    // -------------------------------------------------------------------------

    private function dateStr(mixed $date): ?string
    {
        if ($date === null) {
            return null;
        }

        if ($date instanceof \DateTimeInterface) {
            return $date->format('Y-m-d');
        }

        $str = (string) $date;

        // Strip time component if present
        return substr($str, 0, 10);
    }

    private function inferShortTermFromDates(?string $dateAcquired, string $dateSold): ?bool
    {
        if ($dateAcquired === null || strtolower($dateAcquired) === 'various' || trim($dateSold) === '') {
            return null;
        }

        try {
            $acquired = new \DateTimeImmutable($dateAcquired);
            $sold = new \DateTimeImmutable($dateSold);
        } catch (\Throwable) {
            return null;
        }

        return $acquired->diff($sold)->days <= 365;
    }
}
