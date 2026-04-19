<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Services\ClientManagement\DataTransferObjects\OverpaymentLedger;

/**
 * Tracks overpayment-derived credits for a client company and applies them
 * as credit lines on the next draft invoice.
 *
 * See docs/client-management/overpayment-credits.md for semantics and
 * invariants.
 */
class OverpaymentCreditService
{
    /**
     * Total credit currently available for a company, in dollars.
     *
     * available_credit =
     *     Σ max(0, total_payments − invoice_total)   (non-void invoices)
     *   − Σ |credit line_total|                      (on issued/paid invoices)
     *
     * Drafts don't count as "consumed" since they regenerate freely.
     */
    public function availableCreditForCompany(ClientCompany $company): float
    {
        $ledger = $this->buildLedger($company);

        return $ledger->totalRemaining;
    }

    /**
     * Itemised view of overpayment credits for UI + debugging.
     */
    public function buildLedger(ClientCompany $company): OverpaymentLedger
    {
        $invoices = ClientInvoice::query()
            ->where('client_company_id', $company->id)
            ->whereNotIn('status', ['void'])
            ->with('payments')
            ->get();

        $totalConsumed = $this->totalConsumed($company);
        $totalOverpaid = 0.0;

        /** @var list<array{invoice_id: int, invoice_number: string|null, overpaid: float, consumed: float, remaining: float}> $entries */
        $entries = [];

        foreach ($invoices as $invoice) {
            $paymentsTotal = (float) $invoice->payments->sum('amount');
            $invoiceTotal = (float) $invoice->invoice_total;
            $overpaid = round(max(0.0, $paymentsTotal - $invoiceTotal), 2);
            if ($overpaid <= 0.0) {
                continue;
            }
            $totalOverpaid += $overpaid;
            $entries[] = [
                'invoice_id' => (int) $invoice->client_invoice_id,
                'invoice_number' => $invoice->invoice_number,
                'overpaid' => $overpaid,
                'consumed' => 0.0, // Filled in below (FIFO).
                'remaining' => $overpaid,
            ];
        }

        // Distribute consumed amount against overpaid invoices FIFO by invoice id.
        usort($entries, fn (array $a, array $b): int => $a['invoice_id'] <=> $b['invoice_id']);
        $remainingToDistribute = $totalConsumed;
        foreach ($entries as $i => $entry) {
            if ($remainingToDistribute <= 0.0) {
                break;
            }
            $consume = min($entry['remaining'], $remainingToDistribute);
            $entries[$i]['consumed'] = round($consume, 2);
            $entries[$i]['remaining'] = round($entry['remaining'] - $consume, 2);
            $remainingToDistribute -= $consume;
        }

        $totalRemaining = round(max(0.0, $totalOverpaid - $totalConsumed), 2);

        return new OverpaymentLedger(
            entries: array_values($entries),
            totalRemaining: $totalRemaining,
        );
    }

    /**
     * Apply available credit to a draft invoice (replaces any existing
     * credit line from the last generation pass).
     *
     * Never takes the invoice below $0 — any unused credit rolls forward.
     */
    public function applyCreditsToDraftInvoice(ClientInvoice $invoice): void
    {
        if ($invoice->status !== 'draft') {
            return;
        }

        $company = $invoice->clientCompany;
        if (! $company) {
            return;
        }

        // Remove any stale credit lines from a previous regeneration pass.
        $invoice->lineItems()->where('line_type', InvoiceLineType::Credit->value)->delete();

        $available = $this->availableCreditForCompany($company);
        if ($available <= 0.0) {
            return;
        }

        // Recompute the draft's pre-credit subtotal from line items (after the
        // stale credit was deleted above). We never take an invoice negative
        // — any excess credit stays in the pool for the next draft.
        $subtotal = (float) $invoice->lineItems()->sum('line_total');
        $applied = round(min($available, max(0.0, $subtotal)), 2);
        if ($applied <= 0.0) {
            return;
        }

        $maxSortOrder = (int) ($invoice->lineItems()->max('sort_order') ?? 0);

        ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $invoice->client_agreement_id,
            'description' => 'Credit from prior overpayments',
            'quantity' => '1',
            'unit_price' => -$applied,
            'line_total' => -$applied,
            'line_type' => InvoiceLineType::Credit->value,
            'hours' => null,
            'line_date' => $invoice->period_end,
            'sort_order' => $maxSortOrder + 1,
        ]);

        $invoice->recalculateTotal();
    }

    /**
     * Sum of absolute credit amounts on all non-draft, non-void invoices for a
     * company. Only these count as "consumed" because drafts regenerate freely.
     */
    protected function totalConsumed(ClientCompany $company): float
    {
        $sum = (float) ClientInvoiceLine::query()
            ->join('client_invoices', 'client_invoices.client_invoice_id', '=', 'client_invoice_lines.client_invoice_id')
            ->where('client_invoices.client_company_id', $company->id)
            ->whereIn('client_invoices.status', ['issued', 'paid'])
            ->where('client_invoice_lines.line_type', InvoiceLineType::Credit->value)
            ->whereNull('client_invoice_lines.deleted_at')
            ->whereNull('client_invoices.deleted_at')
            ->sum('client_invoice_lines.line_total');

        return round(abs($sum), 2);
    }
}
