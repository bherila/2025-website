<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Central taxable-lot visibility layer for Schedule D and Form 8949 readers.
 *
 * CapitalGainsTaxReportService and Form8949LotExportService call this directly.
 * Form8949ReportBuilder, ScheduleDFactsBuilder, and TaxPreviewFactsService are
 * intentionally transitively covered through CapitalGainsTaxReportService, while
 * CapitalGainsImportNormalizer only maps supplied lots or parsed transactions.
 */
final class NormalizedLotQuery
{
    private const string LEGACY_ACCEPTED_STATUS = 'accepted';

    /**
     * @return Builder<FinAccountLot>
     */
    public static function forUserYear(int $userId, int $year): Builder
    {
        $accountIds = FinAccounts::forOwner($userId)
            ->pluck('acct_id')
            ->map(static fn (int|string $accountId): int => (int) $accountId)
            ->values()
            ->all();

        return self::forAccountIdsYear($accountIds, $year);
    }

    /**
     * @return Builder<FinAccountLot>
     */
    public static function forAccountYear(int $accountId, int $year): Builder
    {
        return self::forAccountIdsYear([$accountId], $year);
    }

    /**
     * @param  int[]  $accountIds
     * @return Builder<FinAccountLot>
     */
    public static function forAccountIdsYear(array $accountIds, int $year): Builder
    {
        $accountIds = array_values(array_unique(array_map(static fn (int|string $accountId): int => (int) $accountId, $accountIds)));

        return FinAccountLot::query()
            ->when($accountIds === [], fn (Builder $query) => $query->whereRaw('1 = 0'))
            ->when($accountIds !== [], fn (Builder $query) => $query->whereIn('acct_id', $accountIds))
            ->whereBetween('sale_date', ["{$year}-01-01", "{$year}-12-31"])
            ->where(fn (Builder $query) => self::applyYearVisibility($query, $year));
    }

    /**
     * @return Builder<FinAccountLot>
     */
    public static function forTaxDocument(int $taxDocumentId): Builder
    {
        return FinAccountLot::query()
            ->where(fn (Builder $query) => self::applyTaxDocumentVisibility($query, $taxDocumentId));
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyYearVisibility(Builder $query, int $year): void
    {
        $query
            ->where(function (Builder $syntheticLotQuery): void {
                self::applySyntheticAdjustmentSource($syntheticLotQuery);
            })
            ->orWhere(function (Builder $reportedLotQuery): void {
                self::applyDocumentedReportedLot($reportedLotQuery);
            })
            ->orWhere(function (Builder $orphanReportedLotQuery) use ($year): void {
                self::applyOrphanReportedLot($orphanReportedLotQuery, $year);
            })
            ->orWhere(function (Builder $overrideLotQuery) use ($year): void {
                self::applyAccountDerivedLotSource($overrideLotQuery);
                $overrideLotQuery->whereExists(self::overriddenReportedLotForCurrentLot(taxYear: $year));
            })
            ->orWhere(function (Builder $manualLotQuery): void {
                self::applyManualUnlinkedLot($manualLotQuery);
            })
            ->orWhere(function (Builder $legacyAcceptedLotQuery): void {
                self::applyLegacyAcceptedAccountLot($legacyAcceptedLotQuery);
            })
            ->orWhere(function (Builder $nativeFallbackLotQuery) use ($year): void {
                self::applyNativeFallbackLot($nativeFallbackLotQuery, $year);
            });
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyTaxDocumentVisibility(Builder $query, int $taxDocumentId): void
    {
        $query
            ->where(function (Builder $syntheticLotQuery) use ($taxDocumentId): void {
                self::applySyntheticAdjustmentSource($syntheticLotQuery);
                $syntheticLotQuery->where('tax_document_id', $taxDocumentId);
            })
            ->orWhere(function (Builder $reportedLotQuery) use ($taxDocumentId): void {
                self::applyDocumentedReportedLot($reportedLotQuery);
                $reportedLotQuery->where('tax_document_id', $taxDocumentId);
            })
            ->orWhere(function (Builder $overrideLotQuery) use ($taxDocumentId): void {
                self::applyAccountDerivedLotSource($overrideLotQuery);
                $overrideLotQuery->whereExists(self::overriddenReportedLotForCurrentLot(taxDocumentId: $taxDocumentId));
            });
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyDocumentedReportedLot(Builder $query): void
    {
        $query
            ->whereNotNull('tax_document_id')
            ->whereNull('superseded_by_lot_id')
            ->where(fn (Builder $stateQuery) => self::applyNotIgnoredDuplicate($stateQuery));
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyOrphanReportedLot(Builder $query, int $year): void
    {
        $query
            ->whereNull('tax_document_id')
            ->whereNull('superseded_by_lot_id')
            ->where(fn (Builder $sourceQuery) => self::applyReportedLotSource($sourceQuery))
            ->whereNotExists(self::documentedLotsForSameAccountYear($year))
            ->where(fn (Builder $stateQuery) => self::applyNotIgnoredDuplicate($stateQuery));
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyManualUnlinkedLot(Builder $query): void
    {
        $query
            ->where('source', FinAccountLot::SOURCE_MANUAL)
            ->whereNotExists(self::linkForCurrentLot())
            ->where(fn (Builder $stateQuery) => self::applyNotIgnoredDuplicate($stateQuery));
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyNativeFallbackLot(Builder $query, int $year): void
    {
        self::applyAccountDerivedLotSource($query);

        $query
            ->whereNotExists(self::documentedLotsForSameAccountYear($year))
            ->whereNotExists(self::orphanReportedLotsForSameAccountYear($year))
            ->where(fn (Builder $stateQuery) => self::applyNotIgnoredDuplicate($stateQuery));
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyLegacyAcceptedAccountLot(Builder $query): void
    {
        self::applyAccountDerivedLotSource($query);

        $query->where('reconciliation_status', self::LEGACY_ACCEPTED_STATUS);
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applySyntheticAdjustmentSource(Builder $query): void
    {
        $query->where('source', FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT);
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyReportedLotSource(Builder $query): void
    {
        $query->where(function (Builder $sourceQuery): void {
            $sourceQuery
                ->where('source', FinAccountLot::SOURCE_BROKER_1099B)
                ->orWhereIn('lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES);
        });
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyAccountDerivedLotSource(Builder $query): void
    {
        $query
            ->whereNull('tax_document_id')
            ->where(function (Builder $sourceQuery): void {
                $sourceQuery
                    ->whereIn('source', [
                        FinAccountLot::SOURCE_ACCOUNT_DERIVED,
                        FinAccountLot::SOURCE_MANUAL,
                    ])
                    ->orWhereNull('source');
            })
            ->where(function (Builder $lotSourceQuery): void {
                $lotSourceQuery
                    ->whereNull('lot_source')
                    ->orWhereNotIn('lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES);
            });
    }

    /** @param  Builder<FinAccountLot>  $query */
    private static function applyNotIgnoredDuplicate(Builder $query): void
    {
        $query
            ->whereNull('reconciliation_status')
            ->orWhere('reconciliation_status', '!=', FinLotReconciliationLink::STATE_IGNORED_DUPLICATE);
    }

    private static function overriddenReportedLotForCurrentLot(?int $taxYear = null, ?int $taxDocumentId = null): Closure
    {
        return static function (QueryBuilder $overriddenLotsQuery) use ($taxYear, $taxDocumentId): void {
            $overriddenLotsQuery
                ->selectRaw('1')
                ->from('fin_account_lots as overridden_lots')
                ->whereColumn('overridden_lots.superseded_by_lot_id', 'fin_account_lots.lot_id')
                ->whereColumn('overridden_lots.acct_id', 'fin_account_lots.acct_id')
                ->where(function (QueryBuilder $reportedLotQuery): void {
                    $reportedLotQuery
                        ->whereNotNull('overridden_lots.tax_document_id')
                        ->orWhere('overridden_lots.source', FinAccountLot::SOURCE_BROKER_1099B)
                        ->orWhereIn('overridden_lots.lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES);
                })
                ->when($taxYear !== null, fn (QueryBuilder $query) => $query->whereBetween('overridden_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"]))
                ->when($taxDocumentId !== null, fn (QueryBuilder $query) => $query->where('overridden_lots.tax_document_id', $taxDocumentId));
        };
    }

    private static function documentedLotsForSameAccountYear(int $year): Closure
    {
        return static function (QueryBuilder $documentedLotsQuery) use ($year): void {
            $documentedLotsQuery
                ->selectRaw('1')
                ->from('fin_account_lots as documented_lots')
                ->whereColumn('documented_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('documented_lots.sale_date', ["{$year}-01-01", "{$year}-12-31"])
                ->whereNull('documented_lots.superseded_by_lot_id')
                ->whereNotNull('documented_lots.tax_document_id');
        };
    }

    private static function orphanReportedLotsForSameAccountYear(int $year): Closure
    {
        return static function (QueryBuilder $orphanReportedLotsQuery) use ($year): void {
            $orphanReportedLotsQuery
                ->selectRaw('1')
                ->from('fin_account_lots as orphan_reported_lots')
                ->whereColumn('orphan_reported_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('orphan_reported_lots.sale_date', ["{$year}-01-01", "{$year}-12-31"])
                ->whereNull('orphan_reported_lots.superseded_by_lot_id')
                ->whereNull('orphan_reported_lots.tax_document_id')
                ->where(function (QueryBuilder $reportedLotQuery): void {
                    $reportedLotQuery
                        ->where('orphan_reported_lots.source', FinAccountLot::SOURCE_BROKER_1099B)
                        ->orWhereIn('orphan_reported_lots.lot_source', ReportedLotQueryScopes::REPORTED_LOT_SOURCES);
                });
        };
    }

    private static function linkForCurrentLot(): Closure
    {
        return static function (QueryBuilder $linkQuery): void {
            $linkQuery
                ->selectRaw('1')
                ->from('fin_lot_reconciliation_links as lot_links')
                ->where(function (QueryBuilder $linkedLotQuery): void {
                    $linkedLotQuery
                        ->whereColumn('lot_links.broker_lot_id', 'fin_account_lots.lot_id')
                        ->orWhereColumn('lot_links.account_lot_id', 'fin_account_lots.lot_id');
                });
        };
    }
}
