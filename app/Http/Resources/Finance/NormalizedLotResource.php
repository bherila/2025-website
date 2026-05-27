<?php

namespace App\Http\Resources\Finance;

use App\Models\FinanceTool\FinAccountLot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Normalized lot DTO for the lot-workspace API.
 *
 * Provides a consistent shape consumed by Account Lot View, Lot Analyzer,
 * Form 8949 preview, per-document reconcile, and global reconciliation.
 *
 * @mixin FinAccountLot
 */
class NormalizedLotResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var FinAccountLot $lot */
        $lot = $this->resource;

        $account = $lot->relationLoaded('account') ? $lot->getRelation('account') : null;

        return [
            'id' => (int) $lot->lot_id,
            'source' => $lot->source,
            'lot_origin' => $lot->lot_origin,
            'document_id' => $lot->document_id,
            'statement_id' => $lot->statement_id ? (int) $lot->statement_id : null,
            'account_id' => (int) $lot->acct_id,
            'account_name' => $account?->acct_name,
            'account_number' => $account?->acct_number,
            'symbol' => $lot->symbol,
            'cusip' => $lot->cusip,
            'description' => $lot->description,
            'quantity' => $lot->quantity,
            'acquired_date' => $lot->purchase_date?->format('Y-m-d'),
            'sold_date' => $lot->sale_date?->format('Y-m-d'),
            'basis' => $lot->cost_basis,
            'proceeds' => $lot->proceeds,
            'wash_sale_disallowed' => $lot->wash_sale_disallowed,
            'realized_gain' => $lot->realized_gain_loss,
            'is_short_term' => $lot->is_short_term,
            'form_8949_box' => $lot->form_8949_box,
            'is_covered' => $lot->is_covered,
            'accrued_market_discount' => $lot->accrued_market_discount,
            'reconciliation_state' => $lot->reconciliation_status,
            'superseded_by' => $lot->superseded_by_lot_id ? (int) $lot->superseded_by_lot_id : null,
            'lot_source' => $lot->lot_source,
            'created_at' => $lot->created_at?->toIso8601String(),
            'updated_at' => $lot->updated_at?->toIso8601String(),
        ];
    }
}
