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
        $documentId = $lot->document_id !== null ? (int) $lot->document_id : null;
        $taxDocumentId = $lot->tax_document_id;
        $statementId = $lot->statement_id !== null ? (int) $lot->statement_id : null;
        $openTransactionId = $lot->open_t_id !== null ? (int) $lot->open_t_id : null;
        $closeTransactionId = $lot->close_t_id !== null ? (int) $lot->close_t_id : null;
        $linkId = $lot->getAttribute('reconciliation_link_id');

        return [
            'id' => (int) $lot->lot_id,
            'source' => $lot->source,
            'lot_origin' => $lot->lot_origin,
            'document_id' => $documentId,
            'tax_document_id' => $taxDocumentId,
            'statement_id' => $statementId,
            'open_transaction_id' => $openTransactionId,
            'close_transaction_id' => $closeTransactionId,
            'account_id' => (int) $lot->acct_id,
            'account_name' => $account?->acct_name,
            'account_number' => $account?->acct_number,
            'symbol' => $lot->symbol,
            'cusip' => $lot->cusip,
            'description' => $lot->description,
            'quantity' => $lot->quantity,
            'acquired_date' => $lot->purchase_date->format('Y-m-d'),
            'sold_date' => $lot->sale_date?->format('Y-m-d'),
            'basis' => $lot->cost_basis,
            'proceeds' => $lot->proceeds,
            'wash_sale_disallowed' => $lot->wash_sale_disallowed,
            'realized_gain' => $lot->realized_gain_loss,
            'is_short_term' => $lot->is_short_term,
            'form_8949_box' => $lot->form_8949_box,
            'is_covered' => $lot->is_covered,
            'accrued_market_discount' => $lot->accrued_market_discount,
            'reconciliation_state' => $lot->getAttribute('reconciliation_state'),
            'link_id' => $linkId !== null ? (int) $linkId : null,
            'superseded_by' => $lot->superseded_by_lot_id ? (int) $lot->superseded_by_lot_id : null,
            'lot_source' => $lot->getAttribute('lot_source'),
            'capabilities' => $this->capabilities($documentId, $taxDocumentId, $statementId, $openTransactionId, $closeTransactionId, $linkId !== null),
            'created_at' => $lot->created_at?->toIso8601String(),
            'updated_at' => $lot->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return list<string>
     */
    private function capabilities(
        ?int $documentId,
        ?int $taxDocumentId,
        ?int $statementId,
        ?int $openTransactionId,
        ?int $closeTransactionId,
        bool $hasLink,
    ): array {
        $capabilities = [];

        if ($documentId !== null) {
            $capabilities[] = 'view_source_document';
        }
        if ($statementId !== null) {
            $capabilities[] = 'view_statement';
        }
        if ($openTransactionId !== null) {
            $capabilities[] = 'view_open_transaction';
        }
        if ($closeTransactionId !== null) {
            $capabilities[] = 'view_close_transaction';
        }
        // Reconciliation links require a `fin_tax_documents.id`, not the
        // underlying `fin_documents.id`, since the controller resolves
        // `FileForTaxDocument::findOrFail($id)`.
        if ($hasLink && $taxDocumentId !== null) {
            $capabilities[] = 'open_reconciliation';
        }

        return $capabilities;
    }
}
