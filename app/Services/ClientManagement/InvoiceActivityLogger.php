<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;

/**
 * Records invoice.generated / invoice.updated activity log entries with
 * fingerprint-based deduplication so that repeated draft regenerations do not
 * flood the activity log with identical rows.
 */
class InvoiceActivityLogger
{
    /**
     * Record an invoice-generated event, deduplicating against the most recent
     * prior activity for the same invoice.
     *
     * - No prior activity  → records action "invoice.generated".
     * - Prior exists, fingerprint identical → records nothing, returns null.
     * - Prior exists, fingerprint differs → records action "invoice.updated"
     *   with a concise summary of which fields changed.
     */
    public function recordGenerated(ClientCompany $company, ClientInvoice $invoice): ?ClientCompanyActivity
    {
        $invoice->loadMissing('lineItems');

        // Normalize via JSON round-trip so that float-vs-int differences introduced
        // by JSON encoding/decoding (e.g. 750.0 → 750) do not cause false mismatches
        // on subsequent compares against stored payloads.
        /** @var array<string, mixed> $fingerprint */
        $fingerprint = json_decode(json_encode($this->buildFingerprint($invoice)) ?: '[]', true);

        $priorActivity = ClientCompanyActivity::query()
            ->where('client_company_id', $company->id)
            ->where('subject_type', ClientInvoice::class)
            ->where('subject_id', $invoice->getKey())
            ->whereIn('action', ['invoice.generated', 'invoice.updated'])
            ->latest()
            ->first();

        $humanReadable = [
            'invoice_kind' => $invoice->invoiceKindValue(),
            'period_start' => $invoice->period_start?->toDateString(),
            'period_end' => $invoice->period_end?->toDateString(),
            'cycle_start' => $invoice->cycle_start?->toDateString(),
            'cycle_end' => $invoice->cycle_end?->toDateString(),
            'invoice_total' => (float) $invoice->invoice_total,
        ];

        if ($priorActivity === null) {
            return ClientCompanyActivity::record($company, 'invoice.generated', $invoice, array_merge(
                ['fingerprint' => $fingerprint],
                $humanReadable,
            ));
        }

        $priorFingerprint = $priorActivity->payload['fingerprint'] ?? null;

        if ($priorFingerprint === $fingerprint) {
            return null;
        }

        $changes = $this->summarizeChanges($priorFingerprint, $fingerprint);

        return ClientCompanyActivity::record($company, 'invoice.updated', $invoice, array_merge(
            ['fingerprint' => $fingerprint, 'changes' => $changes],
            $humanReadable,
        ));
    }

    /**
     * Build a stable fingerprint array representing the invoice's meaningful state.
     *
     * @return array<string, mixed>
     */
    private function buildFingerprint(ClientInvoice $invoice): array
    {
        $lineItems = $invoice->lineItems
            ->sortBy([['line_type', 'asc'], ['client_invoice_line_id', 'asc']])
            ->values()
            ->map(fn (ClientInvoiceLine $line): array => [
                'line_type' => $line->line_type,
                'description' => $line->description,
                'quantity' => $line->quantity,
                'unit_price' => (string) $line->unit_price,
                'total' => (string) $line->line_total,
            ])
            ->all();

        return [
            'invoice_kind' => $invoice->invoiceKindValue(),
            'status' => $invoice->status,
            'period_start' => $invoice->period_start?->toDateString(),
            'period_end' => $invoice->period_end?->toDateString(),
            'cycle_start' => $invoice->cycle_start?->toDateString(),
            'cycle_end' => $invoice->cycle_end?->toDateString(),
            'invoice_total' => (float) $invoice->invoice_total,
            'hours_worked' => (float) $invoice->hours_worked,
            'retainer_hours_included' => (float) $invoice->retainer_hours_included,
            'hours_billed_at_rate' => (float) $invoice->hours_billed_at_rate,
            'line_count' => $invoice->lineItems->count(),
            'line_digest' => sha1(json_encode($lineItems) ?: ''),
        ];
    }

    /**
     * Produce a human-readable diff of the top-level scalar fingerprint fields.
     *
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>  $new
     * @return array<string, array{old: mixed, new: mixed}>
     */
    private function summarizeChanges(?array $old, array $new): array
    {
        if ($old === null) {
            return [];
        }

        $changes = [];

        foreach ($new as $key => $newValue) {
            if ($key === 'line_digest') {
                continue;
            }

            $oldValue = $old[$key] ?? null;

            if ($oldValue !== $newValue) {
                $changes[$key] = ['old' => $oldValue, 'new' => $newValue];
            }
        }

        if (($old['line_digest'] ?? null) !== ($new['line_digest'] ?? null)) {
            $changes['line_digest'] = ['old' => $old['line_digest'] ?? null, 'new' => $new['line_digest']];
        }

        return $changes;
    }
}
