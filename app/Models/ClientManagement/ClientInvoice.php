<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use App\Services\ClientManagement\DataTransferObjects\InvoiceHoursBreakdown;
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
        'starting_unused_hours',
        'starting_negative_hours',
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
        'starting_unused_hours' => 'decimal:4',
        'starting_negative_hours' => 'decimal:4',
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
     * Calculate hours breakdown: carried-in (previous months) vs current month.
     *
     * @return InvoiceHoursBreakdown
     */
    public function calculateHoursBreakdown(): InvoiceHoursBreakdown
    {
        $this->loadMissing('lineItems.timeEntries');

        $periodStart = $this->period_start;
        $carriedInHours = 0;
        $currentMonthHours = 0;

        foreach ($this->lineItems as $line) {
            if (in_array($line->line_type, ['prior_month_retainer', 'prior_month_billable', 'additional_hours'])) {
                $lineHours = $line->hours ?? 0;

                // Check if line_date is before period_start (carried-in from previous months)
                if ($line->line_date && $line->line_date < $periodStart) {
                    $carriedInHours += $lineHours;
                } else {
                    // Count time entries by their date_worked
                    foreach ($line->timeEntries as $entry) {
                        $entryHours = $entry->minutes_worked / 60;
                        if ($entry->date_worked && $entry->date_worked < $periodStart) {
                            $carriedInHours += $entryHours;
                        } else {
                            $currentMonthHours += $entryHours;
                        }
                    }
                }
            }
        }

        return new InvoiceHoursBreakdown((float) $carriedInHours, (float) $currentMonthHours);
    }

    /**
     * Return a canonical detailed array representation for API responses.
     * Controllers should call this to keep serialization consistent.
     */
    public function toDetailedArray(): array
    {
        $this->loadMissing(['agreement', 'lineItems.timeEntries', 'payments']);

        $hoursBreakdown = $this->calculateHoursBreakdown();

        return [
            'client_invoice_id' => $this->client_invoice_id,
            'client_company_id' => $this->client_company_id,
            'invoice_number' => $this->invoice_number,
            'invoice_total' => $this->invoice_total,
            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'paid_date' => $this->paid_date?->toDateString(),
            'status' => $this->status,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'retainer_hours_included' => $this->retainer_hours_included,
            'hours_worked' => $this->hours_worked,
            'carried_in_hours' => $hoursBreakdown->carriedInHours,
            'current_month_hours' => $hoursBreakdown->currentMonthHours,
            'rollover_hours_used' => $this->rollover_hours_used,
            'unused_hours_balance' => $this->unused_hours_balance,
            'negative_hours_balance' => $this->negative_hours_balance,
            'starting_unused_hours' => $this->starting_unused_hours,
            'starting_negative_hours' => $this->starting_negative_hours,
            'hours_billed_at_rate' => $this->hours_billed_at_rate,
            'notes' => $this->notes,
            'payments' => $this->payments->toArray(),
            'payments_total' => $this->payments_total,
            'remaining_balance' => $this->remaining_balance,
            'agreement' => $this->agreement ? [
                'id' => $this->agreement->id,
                'monthly_retainer_hours' => $this->agreement->monthly_retainer_hours,
                'monthly_retainer_fee' => $this->agreement->monthly_retainer_fee,
                'hourly_rate' => $this->agreement->hourly_rate,
            ] : null,
            'line_items' => $this->lineItems->map(function ($line) {
                return [
                    'client_invoice_line_id' => $line->client_invoice_line_id,
                    'description' => $line->description,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                    'line_type' => $line->line_type,
                    'hours' => $line->hours,
                    'line_date' => $line->line_date?->toDateString(),
                    'time_entries_count' => $line->timeEntries->count(),
                    'time_entries' => $line->timeEntries->map(function ($entry) {
                        return [
                            'name' => $entry->name,
                            'minutes_worked' => $entry->minutes_worked,
                            'date_worked' => $entry->date_worked?->toDateString(),
                        ];
                    })->toArray(),
                ];
            })->toArray(),
        ];
    }

    /**
     * Get the route key for the model.
     */
    public function getRouteKeyName(): string
    {
        return 'client_invoice_id';
    }
}
