<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientInvoice extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_invoices';

    protected $primaryKey = 'client_invoice_id';

    protected $appends = ['payments_total', 'remaining_balance'];

    protected $fillable = [
        'client_company_id',
        'client_agreement_id',
        'period_start',
        'period_end',
        'invoice_number',
        'invoice_total',
        'issue_date',
        'due_date',
        'paid_date',
        'retainer_hours_included',
        'hours_worked',
        'rollover_hours_used',
        'unused_hours_balance',
        'negative_hours_balance',
        'hours_billed_at_rate',
        'status',
        'notes',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'issue_date' => 'datetime',
        'due_date' => 'datetime',
        'paid_date' => 'datetime',
        'invoice_total' => 'decimal:2',
        'retainer_hours_included' => 'decimal:4',
        'hours_worked' => 'decimal:4',
        'rollover_hours_used' => 'decimal:4',
        'unused_hours_balance' => 'decimal:4',
        'negative_hours_balance' => 'decimal:4',
        'hours_billed_at_rate' => 'decimal:4',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted()
    {
        static::deleting(function ($invoice) {
            // Delete associated line items (this will trigger ClientInvoiceLine's deleting event)
            foreach ($invoice->lineItems as $line) {
                $line->delete();
            }
        });
    }

    /**
     * Get the client company for this invoice.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the agreement this invoice is associated with.
     */
    public function agreement()
    {
        return $this->belongsTo(ClientAgreement::class, 'client_agreement_id');
    }

    /**
     * Get the line items for this invoice.
     */
    public function lineItems()
    {
        return $this->hasMany(ClientInvoiceLine::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * Get the payments for this invoice.
     */
    public function payments()
    {
        return $this->hasMany(ClientInvoicePayment::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * Accessor for the total of all payments.
     */
    public function getPaymentsTotalAttribute()
    {
        return $this->payments->sum('amount');
    }

    /**
     * Accessor for the remaining balance.
     */
    public function getRemainingBalanceAttribute()
    {
        return $this->invoice_total - $this->payments_total;
    }

    /**
     * Check if the invoice is editable (still in draft).
     */
    public function isEditable(): bool
    {
        return $this->status === 'draft';
    }

    /**
     * Check if the invoice has been issued.
     */
    public function isIssued(): bool
    {
        return $this->issue_date !== null;
    }

    /**
     * Issue the invoice.
     */
    public function issue(): void
    {
        $this->update([
            'status' => 'issued',
            'issue_date' => now(),
        ]);
    }

    /**
     * Mark the invoice as paid.
     *
     * @param  \Carbon\Carbon|string|null  $paidDate  The date the invoice was paid. Defaults to now().
     */
    public function markPaid($paidDate = null): void
    {
        $this->update([
            'status' => 'paid',
            'paid_date' => $paidDate ?? now(),
        ]);
    }

    /**
     * Void the invoice.
     */
    public function void(): void
    {
        // Unlink time entries from this invoice's lines so they can be re-billed
        foreach ($this->lineItems as $line) {
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
        }

        $this->update([
            'status' => 'void',
        ]);
    }

    /**
     * Revert a voided invoice to issued or draft status.
     *
     * @param  string  $targetStatus  The status to revert to ('issued' or 'draft')
     */
    public function unVoid(string $targetStatus = 'issued'): void
    {
        if (! in_array($targetStatus, ['issued', 'draft'])) {
            throw new \InvalidArgumentException('Target status must be "issued" or "draft"');
        }

        $this->update([
            'status' => $targetStatus,
        ]);
    }

    /**
     * Calculate the total from line items.
     */
    public function recalculateTotal(): void
    {
        $total = $this->lineItems()->sum('line_total');
        $this->update(['invoice_total' => $total]);
    }

    /**
     * Get the route key for the model.
     */
    public function getRouteKeyName(): string
    {
        return 'client_invoice_id';
    }
}
