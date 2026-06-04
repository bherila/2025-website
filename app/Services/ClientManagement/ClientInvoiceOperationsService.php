<?php

namespace App\Services\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Models\ClientManagement\ClientInvoiceStripePayment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

class ClientInvoiceOperationsService
{
    /** @var list<string> */
    public const STATUSES = ['draft', 'issued', 'paid', 'void'];

    /**
     * @param  list<string>  $statuses
     * @return EloquentCollection<int, ClientInvoice>
     */
    public function listInvoices(?ClientCompany $company = null, array $statuses = []): EloquentCollection
    {
        return ClientInvoice::query()
            ->with(['agreement', 'clientCompany', 'clientCompany.users:id,email', 'lineItems', 'payments', 'stripePayments'])
            ->when($company, fn (Builder $query): Builder => $query->where('client_company_id', $company->id))
            ->when($statuses !== [], fn (Builder $query): Builder => $query->whereIn('status', $statuses))
            ->orderByDesc('period_start')
            ->orderByDesc('client_invoice_id')
            ->get();
    }

    /**
     * @return array<string, mixed>
     */
    public function summarizeInvoice(ClientInvoice $invoice): array
    {
        $latestStripeFailure = $invoice->stripePayments
            ->filter(fn (ClientInvoiceStripePayment $stripePayment): bool => $stripePayment->failure_reason !== null || in_array($stripePayment->status, ['failed', 'canceled'], true))
            ->sortByDesc('updated_at')
            ->first();

        return [
            'id' => $invoice->client_invoice_id,
            'company_id' => $invoice->client_company_id,
            'company_name' => $invoice->clientCompany?->company_name,
            'invoice_number' => $invoice->invoice_number,
            'period_start' => $invoice->period_start?->toDateString(),
            'period_end' => $invoice->period_end?->toDateString(),
            'invoice_total' => (float) $invoice->invoice_total,
            'payments_total' => (float) $invoice->payments_total,
            'remaining_balance' => (float) $invoice->remaining_balance,
            'status' => $invoice->status,
            'invoice_kind' => $invoice->invoiceKindValue(),
            'cycle_start' => $invoice->cycle_start?->toDateString(),
            'cycle_end' => $invoice->cycle_end?->toDateString(),
            'agreement_id' => $invoice->client_agreement_id,
            'client_agreement_id' => $invoice->client_agreement_id,
            'issue_date' => $invoice->issue_date?->toDateString(),
            'due_date' => $invoice->due_date?->toDateString(),
            'paid_date' => $invoice->paid_date?->toDateString(),
            'last_emailed_at' => $invoice->last_emailed_at?->toIso8601String(),
            'billing_email' => $invoice->clientCompany?->billing_email ?: null,
            'recipient_suggestions' => $invoice->clientCompany
                ? $invoice->clientCompany->users->pluck('email')->filter()->unique()->values()->all()
                : [],
            'hours_worked' => (float) $invoice->hours_worked,
            'retainer_hours_included' => (float) $invoice->retainer_hours_included,
            'unused_hours_balance' => (float) $invoice->unused_hours_balance,
            'negative_hours_balance' => (float) $invoice->negative_hours_balance,
            'starting_unused_hours' => $invoice->starting_unused_hours === null ? null : (float) $invoice->starting_unused_hours,
            'starting_negative_hours' => $invoice->starting_negative_hours === null ? null : (float) $invoice->starting_negative_hours,
            'hours_billed_at_rate' => (float) $invoice->hours_billed_at_rate,
            'rollover_hours_used' => (float) $invoice->rollover_hours_used,
            'stripe_payment_status' => $latestStripeFailure?->status,
            'stripe_failure_reason' => $latestStripeFailure?->failure_reason,
        ];
    }

    /**
     * @param  EloquentCollection<int, ClientInvoice>  $invoices
     * @return array<int, array<string, mixed>>
     */
    public function summarizeInvoices(EloquentCollection $invoices): array
    {
        return $invoices
            ->map(fn (ClientInvoice $invoice): array => $this->summarizeInvoice($invoice))
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function addPayment(ClientInvoice $invoice, array $data, bool $issuedOnly = false): ClientInvoicePayment
    {
        if ($issuedOnly && $invoice->status !== 'issued') {
            throw new ClientManagementActionException('Payments can only be applied to issued invoices from this command.');
        }

        $payment = $invoice->payments()->create([
            'amount' => round((float) $data['amount'], 2),
            'payment_date' => $data['payment_date'],
            'payment_method' => $this->normalizePaymentMethod((string) $data['payment_method']),
            'notes' => $data['notes'] ?? null,
        ]);

        $this->syncInvoicePaymentStatus($invoice);

        return $payment;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updatePayment(ClientInvoice $invoice, ClientInvoicePayment $payment, array $data): ClientInvoicePayment
    {
        $payment->update([
            'amount' => round((float) $data['amount'], 2),
            'payment_date' => $data['payment_date'],
            'payment_method' => $this->normalizePaymentMethod((string) $data['payment_method']),
            'notes' => $data['notes'] ?? null,
        ]);

        $this->syncInvoicePaymentStatus($invoice);

        return $payment->fresh();
    }

    public function deletePayment(ClientInvoice $invoice, ClientInvoicePayment $payment): void
    {
        $payment->delete();
        $this->syncInvoicePaymentStatus($invoice);
    }

    public function normalizePaymentMethod(string $paymentMethod): string
    {
        $normalized = strtolower(trim(str_replace(['_', '-'], ' ', $paymentMethod)));

        return match ($normalized) {
            'credit card', 'card' => 'Credit Card',
            'ach' => 'ACH',
            'wire' => 'Wire',
            'check' => 'Check',
            'other' => 'Other',
            'stripe card' => 'stripe_card',
            'stripe ach' => 'stripe_ach',
            'stripe refund' => 'stripe_refund',
            default => $paymentMethod,
        };
    }

    private function syncInvoicePaymentStatus(ClientInvoice $invoice): void
    {
        $invoiceFresh = $invoice->fresh(['payments']);

        if (! $invoiceFresh) {
            return;
        }

        if ($invoiceFresh->remaining_balance <= 0) {
            $latestPaymentDate = $invoiceFresh->payments()->max('payment_date');
            $invoice->markPaid($latestPaymentDate);

            return;
        }

        if ($invoiceFresh->status === 'paid') {
            $invoiceFresh->update(['status' => 'issued', 'paid_date' => null]);
        }
    }
}
