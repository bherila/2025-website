<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinAccountLot;
use Closure;
use Illuminate\Database\Eloquent\Builder;

final class ReportedLotQueryScopes
{
    public const array REPORTED_LOT_SOURCES = [
        FinAccountLot::SOURCE_1099B,
        FinAccountLot::SOURCE_1099B_UNDERSCORE,
        'import_1099b',
    ];

    /**
     * @param  Builder<FinAccountLot>  $query
     */
    public static function applyReportedLotSource(Builder $query): void
    {
        $query->whereIn('lot_source', self::REPORTED_LOT_SOURCES)
            ->orWhereIn('lot_origin', [
                FinAccountLot::ORIGIN_1099B_DISPOSITION,
                FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
            ]);
    }

    /**
     * @param  Builder<FinAccountLot>  $query
     */
    public static function applyNativeAccountLotSource(Builder $query): void
    {
        $query->where(function (Builder $originQuery): void {
            $originQuery->whereNull('lot_origin')
                ->orWhereNotIn('lot_origin', [
                    FinAccountLot::ORIGIN_1099B_DISPOSITION,
                    FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                    FinAccountLot::ORIGIN_STATEMENT_POSITION,
                ]);
        })
            ->where(function (Builder $sourceQuery): void {
                $sourceQuery->whereNull('lot_source')
                    ->orWhereNotIn('lot_source', self::REPORTED_LOT_SOURCES);
            });
    }

    public static function reportedLotsOverriddenByCurrentLot(?int $taxYear = null, ?int $documentId = null): Closure
    {
        return static function ($overriddenLotsQuery) use ($taxYear, $documentId): void {
            $overriddenLotsQuery->selectRaw('1')
                ->from('fin_account_lots as overridden_lots')
                ->whereColumn('overridden_lots.superseded_by_lot_id', 'fin_account_lots.lot_id')
                ->whereColumn('overridden_lots.acct_id', 'fin_account_lots.acct_id')
                ->where(function ($reportedLotQuery): void {
                    $reportedLotQuery->whereIn('overridden_lots.lot_origin', [
                        FinAccountLot::ORIGIN_1099B_DISPOSITION,
                        FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                    ])
                        ->orWhereIn('overridden_lots.lot_source', self::REPORTED_LOT_SOURCES);
                })
                ->when($taxYear !== null, fn ($query) => $query->whereBetween('overridden_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"]))
                ->when($documentId !== null, fn ($query) => $query->where('overridden_lots.document_id', $documentId));
        };
    }

    public static function documentedLotsForSameAccountYear(int $taxYear): Closure
    {
        return static function ($documentedLotsQuery) use ($taxYear): void {
            $documentedLotsQuery->selectRaw('1')
                ->from('fin_account_lots as documented_lots')
                ->whereColumn('documented_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('documented_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
                ->whereNull('documented_lots.superseded_by_lot_id')
                ->whereIn('documented_lots.lot_origin', [
                    FinAccountLot::ORIGIN_1099B_DISPOSITION,
                    FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                ]);
        };
    }

    public static function orphanReportedLotsForSameAccountYear(int $taxYear): Closure
    {
        return static function ($orphanReportedLotsQuery) use ($taxYear): void {
            $orphanReportedLotsQuery->selectRaw('1')
                ->from('fin_account_lots as orphan_reported_lots')
                ->whereColumn('orphan_reported_lots.acct_id', 'fin_account_lots.acct_id')
                ->whereBetween('orphan_reported_lots.sale_date', ["{$taxYear}-01-01", "{$taxYear}-12-31"])
                ->whereNull('orphan_reported_lots.superseded_by_lot_id')
                ->whereNull('orphan_reported_lots.document_id')
                ->whereIn('orphan_reported_lots.lot_source', self::REPORTED_LOT_SOURCES);
        };
    }
}
