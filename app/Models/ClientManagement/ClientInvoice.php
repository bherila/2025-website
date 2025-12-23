<?php

namespace App\Models\ClientManagement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientInvoice extends Model
{
    use SoftDeletes;

    protected $table = 'client_invoices';
    protected $primaryKey = 'client_invoice_id';

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
     * Check if the invoice is editable (still in draft).
     */
    public function isEditable(): bool
    {
        return $this->status === 'draft';
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
     */
    public function markPaid(): void
    {
        $this->update([
            'status' => 'paid',
            'paid_date' => now(),
        ]);
    }

    /**
     * Void the invoice.
     */
    public function void(): void
    {
        $this->update([
            'status' => 'void',
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
