<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Closure;

class CapitalGainsTaxReportService
{
    public function __construct(
        private readonly WashSaleAnalysisEngine $washSaleEngine,
        private readonly Form8949ReportBuilder $reportBuilder,
        private readonly CapitalGainsImportNormalizer $normalizer,
    ) {}

    /**
     * @return array{taxYear:int,reportingMode:string,transactions:array<int,CanonicalCapitalGainTransaction>,adjustments:array<int,WashSaleAdjustment>,rows:array<int,Form8949ReportRow>,scheduleDRollup:array<int,ScheduleDRollupInput>}
     */
    public function reportForUserYear(
        int $userId,
        int $taxYear,
        string $reportingMode = 'form_8949_transactions',
    ): array {
        $accountIds = $this->accountIdsForUser($userId);
        $adjustments = $this->washSaleEngine->analyze($accountIds, $taxYear);
        $transactions = $this->loadCanonicalTransactions($accountIds, $taxYear);

        return [
            'taxYear' => $taxYear,
            'reportingMode' => $reportingMode,
            'transactions' => $transactions,
            'adjustments' => $adjustments,
            'rows' => $this->reportBuilder->buildRows($transactions, $adjustments, $reportingMode),
            'scheduleDRollup' => $this->reportBuilder->buildScheduleDRollup($transactions, $adjustments, $reportingMode),
        ];
    }

    /**
     * Load closed account lots for the given accounts/year as canonical transactions.
     *
     * Imported tax-document lots are the default source of truth for filed-return
     * Schedule D values. Native account/analyzer lots are included when they
     * have been explicitly accepted during reconciliation or when they supersede
     * a reported 1099-B lot.
     *
     * @param  int[]  $accountIds
     * @return CanonicalCapitalGainTransaction[]
     */
    public function loadCanonicalTransactions(array $accountIds, int $taxYear): array
    {
        if ($accountIds === []) {
            return [];
        }

        $lots = FinAccountLot::query()
            ->whereIn('acct_id', $accountIds)
            ->whereBetween('sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
            ->whereNull('superseded_by_lot_id')
            ->where(function ($query) use ($taxYear): void {
                $query->whereNotNull('tax_document_id')
                    ->orWhere(function ($orphanReportedLotQuery) use ($taxYear): void {
                        $orphanReportedLotQuery->whereNull('tax_document_id')
                            ->whereIn('lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES)
                            ->whereNotExists($this->documentedLotsForSameAccountYear($taxYear));
                    })
                    ->orWhere(function ($nativeLotQuery) use ($taxYear): void {
                        ReportedLotQueryScopes::applyNativeAccountLotSource($nativeLotQuery);
                        $nativeLotQuery->where(function ($reviewedNativeLotQuery) use ($taxYear): void {
                            $reviewedNativeLotQuery->where('reconciliation_status', 'accepted')
                                ->orWhereExists(ReportedLotQueryScopes::reportedLotsOverriddenByCurrentLot(taxYear: $taxYear));
                        });
                    })
                    ->orWhere(function ($nativeFallbackLotQuery) use ($taxYear): void {
                        ReportedLotQueryScopes::applyNativeAccountLotSource($nativeFallbackLotQuery);
                        $nativeFallbackLotQuery
                            ->whereNotExists($this->documentedLotsForSameAccountYear($taxYear))
                            ->whereNotExists($this->orphanReportedLotsForSameAccountYear($taxYear));
                    });
            })
            ->with(['account:acct_id,acct_name'])
            ->orderBy('acct_id')
            ->orderBy('symbol')
            ->orderBy('sale_date')
            ->orderBy('lot_id')
            ->get();

        $transactions = [];
        foreach ($lots as $lot) {
            $transactions[] = $this->normalizer->fromAccountLot($lot);
        }

        return $transactions;
    }

    private function documentedLotsForSameAccountYear(int $taxYear): Closure
    {
        return static function ($documentedLotsQuery) use ($taxYear): void {
            $documentedLotsQuery->selectRaw('1')
                ->from('fin_account_lots as documented_lots')
                ->whereColumn('documented_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('documented_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
                ->whereNull('documented_lots.superseded_by_lot_id')
                ->whereNotNull('documented_lots.tax_document_id');
        };
    }

    private function orphanReportedLotsForSameAccountYear(int $taxYear): Closure
    {
        return static function ($orphanReportedLotsQuery) use ($taxYear): void {
            $orphanReportedLotsQuery->selectRaw('1')
                ->from('fin_account_lots as orphan_reported_lots')
                ->whereColumn('orphan_reported_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('orphan_reported_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
                ->whereNull('orphan_reported_lots.superseded_by_lot_id')
                ->whereNull('orphan_reported_lots.tax_document_id')
                ->whereIn('orphan_reported_lots.lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES);
        };
    }

    /**
     * @param  Form8949ReportRow[]  $rows
     * @return array<int, array<string, mixed>>
     */
    public function rowsPayload(array $rows): array
    {
        return array_map(static fn (Form8949ReportRow $row): array => [
            'form_8949_box' => $row->form8949Box,
            'description' => $row->description,
            'date_acquired' => $row->dateAcquired,
            'date_sold' => $row->dateSold,
            'proceeds' => $row->proceeds,
            'cost_basis' => $row->costBasis,
            'adjustment_code' => $row->adjustmentCode,
            'adjustment_amount' => $row->adjustmentAmount,
            'gain_or_loss' => $row->gainOrLoss,
            'is_short_term' => $row->isShortTerm,
            'is_covered' => $row->isCovered,
            'is_summary_row' => $row->isSummaryRow,
            'account_name' => $row->accountName,
            'tax_document_id' => $row->taxDocumentId,
            'source_transaction_id' => $row->sourceTransactionId,
        ], $rows);
    }

    /**
     * @param  ScheduleDRollupInput[]  $rollups
     * @return array<int, array<string, mixed>>
     */
    public function rollupPayload(array $rollups): array
    {
        return array_map(static fn (ScheduleDRollupInput $rollup): array => [
            'form_8949_box' => $rollup->form8949Box,
            'is_short_term' => $rollup->isShortTerm,
            'schedule_d_line' => $rollup->scheduleDLine,
            'total_proceeds' => $rollup->totalProceeds,
            'total_cost_basis' => $rollup->totalCostBasis,
            'total_adjustment' => $rollup->totalAdjustment,
            'net_gain_or_loss' => $rollup->netGainOrLoss,
            'row_count' => $rollup->rowCount,
        ], $rollups);
    }

    /**
     * @param  WashSaleAdjustment[]  $adjustments
     * @return array<int, array<string, mixed>>
     */
    public function adjustmentsPayload(array $adjustments): array
    {
        return array_map(static fn (WashSaleAdjustment $adjustment): array => [
            'id' => $adjustment->id,
            'loss_sale_id' => $adjustment->lossSaleId,
            'replacement_purchase_id' => $adjustment->replacementPurchaseId,
            'symbol' => $adjustment->symbol,
            'sale_date' => $adjustment->saleDateStr,
            'replacement_date' => $adjustment->replacementDateStr,
            'disallowed_loss' => $adjustment->disallowedLoss,
            'sale_account_id' => $adjustment->saleAccountId,
            'sale_account_name' => $adjustment->saleAccountName,
            'replacement_account_id' => $adjustment->replacementAccountId,
            'replacement_account_name' => $adjustment->replacementAccountName,
            'is_cross_account' => $adjustment->isCrossAccount,
            'reason' => $adjustment->reason,
            'sale_lot_id' => $adjustment->saleLotId,
            'replacement_lot_id' => $adjustment->replacementLotId,
            'detection_note' => $adjustment->detectionNote,
        ], $adjustments);
    }

    /**
     * @return int[]
     */
    private function accountIdsForUser(int $userId): array
    {
        return FinAccounts::forOwner($userId)
            ->pluck('acct_id')
            ->map(static fn (int|string $id): int => (int) $id)
            ->values()
            ->all();
    }
}
