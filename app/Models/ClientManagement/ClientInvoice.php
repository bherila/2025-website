<?php

namespace App\Models\ClientManagement;

use App\Enums\ClientManagement\InvoiceKind;
use App\Services\ClientManagement\DataTransferObjects\InvoiceHoursBreakdown;
use App\Services\ClientManagement\DeferredBillingAllocator;
use App\Services\ClientManagement\OverpaymentCreditService;
use App\Traits\SerializesDatesAsLocal;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

class ClientInvoice extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_invoices';

    protected $primaryKey = 'client_invoice_id';

    /**
     * Statuses for invoices that no longer carry a collectible balance.
     *
     * @var list<string>
     */
    public const SETTLED_STATUSES = ['paid', 'void'];

    /**
     * Statuses visible to non-admin client portal users.
     *
     * @var list<string>
     */
    public const CLIENT_VISIBLE_STATUSES = ['issued', 'paid'];

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
        'invoice_kind',
        'cycle_start',
        'cycle_end',
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
        'invoice_kind' => InvoiceKind::class,
        'cycle_start' => 'date',
        'cycle_end' => 'date',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
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
     *
     * @return BelongsTo<ClientCompany, self>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the agreement this invoice is associated with.
     *
     * @return BelongsTo<ClientAgreement, self>
     */
    public function agreement(): BelongsTo
    {
        return $this->belongsTo(ClientAgreement::class, 'client_agreement_id');
    }

    /**
     * Get the line items for this invoice.
     *
     * @return HasMany<ClientInvoiceLine, self>
     */
    public function lineItems(): HasMany
    {
        return $this->hasMany(ClientInvoiceLine::class, 'client_invoice_id', 'client_invoice_id');
    }

    public function invoiceKindValue(): string
    {
        // Use tryFrom() on the raw DB value to avoid a ValueError when the column
        // holds a value that was written before the enum case was added.
        return (InvoiceKind::tryFrom($this->getRawOriginal('invoice_kind') ?? '') ?? InvoiceKind::CadencePeriod)->value;
    }

    /**
     * Get the payments for this invoice.
     *
     * @return HasMany<ClientInvoicePayment, self>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(ClientInvoicePayment::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * @return HasMany<ClientInvoiceStripePayment, $this>
     */
    public function stripePayments(): HasMany
    {
        return $this->hasMany(ClientInvoiceStripePayment::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * Accessor for the total of all payments.
     */
    public function getPaymentsTotalAttribute(): float
    {
        return (float) $this->payments->sum('amount');
    }

    /**
     * Accessor for the remaining balance.
     */
    public function getRemainingBalanceAttribute(): float
    {
        return (float) $this->invoice_total - (float) $this->payments_total;
    }

    /**
     * Scope to invoices that may still carry a balance (not paid or voided).
     *
     * @param  Builder<ClientInvoice>  $query
     * @return Builder<ClientInvoice>
     */
    public function scopeUnpaid(Builder $query): Builder
    {
        return $query->whereNotIn('status', self::SETTLED_STATUSES);
    }

    /**
     * Scope to invoices visible to non-admin client portal users.
     *
     * @param  Builder<ClientInvoice>  $query
     * @return Builder<ClientInvoice>
     */
    public function scopeVisibleToClientPortal(Builder $query): Builder
    {
        return $query->whereIn('status', self::CLIENT_VISIBLE_STATUSES);
    }

    /**
     * Portable SQL fragment for one invoice's remaining balance, clamped at
     * zero. Mirrors {@see getRemainingBalanceAttribute()} plus the per-card
     * `> 0` filter, so overpaid invoices contribute 0 rather than a negative
     * amount. Soft-deleted payments are excluded to match the eager-loaded
     * `payments` relation. Uses only ANSI SQL so it runs on both MySQL and
     * SQLite.
     */
    public static function clampedRemainingSql(string $invoiceAlias = 'client_invoices'): string
    {
        $paid = 'COALESCE((SELECT SUM(p.amount) FROM client_invoice_payments p'
            ." WHERE p.client_invoice_id = {$invoiceAlias}.client_invoice_id"
            .' AND p.deleted_at IS NULL), 0)';

        return "CASE WHEN {$invoiceAlias}.invoice_total - {$paid} > 0"
            ." THEN {$invoiceAlias}.invoice_total - {$paid} ELSE 0 END";
    }

    /**
     * Correlated subquery yielding a client company's open balance: the sum of
     * clamped remaining balances across its non-settled invoices. Shared by the
     * company-list `balance_due` sort and the global `open_balance` stat so the
     * two can never disagree. Correlates on `client_companies.id`.
     */
    public static function companyOpenBalanceSubquery(): QueryBuilder
    {
        return DB::table('client_invoices as ci')
            ->selectRaw('COALESCE(SUM('.self::clampedRemainingSql('ci').'), 0)')
            ->whereColumn('ci.client_company_id', 'client_companies.id')
            ->whereNull('ci.deleted_at')
            ->whereNotIn('ci.status', self::SETTLED_STATUSES);
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
     * Whether the invoice has been settled and must never be silently rewritten
     * by generation. A draft can be marked paid directly (leaving issue_date null),
     * so immutability is keyed on status rather than issue_date — never on isIssued().
     */
    public function isImmutable(): bool
    {
        return in_array($this->status, ['issued', 'paid', 'void'], true);
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
     * @param  Carbon|string|null  $paidDate  The date the invoice was paid. Defaults to now().
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
     *
     * Note: the `agreement` block is a live passthrough of the related
     * ClientAgreement — it reflects current agreement terms, not a snapshot of
     * the terms in force when the invoice was issued. Billing-stable values
     * (rates, hours, totals as of issuance) live on the `line_items` rows
     * (`unit_price`, `line_total`, `hours`); the `agreement` block is for
     * display context only.
     */
    public function toDetailedArray(): array
    {
        $this->loadMissing(['agreement', 'lineItems.timeEntries', 'payments', 'clientCompany', 'stripePayments']);

        $hoursBreakdown = $this->calculateHoursBreakdown();
        $negativeOffset = min((float) $this->negative_hours_balance, (float) $this->retainer_hours_included);

        $creditApplied = round(
            abs((float) $this->lineItems->where('line_type', 'credit')->sum('line_total')),
            2
        );
        $paymentsTotal = (float) $this->payments_total;
        $overpaidAmount = round(max(0.0, $paymentsTotal - (float) $this->invoice_total), 2);
        $availableCreditAfter = 0.0;
        if ($this->clientCompany) {
            $availableCreditAfter = (float) (new OverpaymentCreditService)->availableCreditForCompany($this->clientCompany);
            // On a draft invoice, the service's pool still includes the credit we
            // just applied as a line here (drafts don't count as "consumed" yet).
            // Subtract it so the field matches its documented meaning:
            // "credit remaining AFTER this invoice is accounted for".
            if ((string) $this->status === 'draft') {
                $availableCreditAfter = max(0.0, round($availableCreditAfter - $creditApplied, 2));
            }
        }
        $deferredPending = $this->clientCompany && $this->period_end
            ? $this->buildDeferredPendingList()
            : [];

        return [
            'client_invoice_id' => $this->client_invoice_id,
            'client_company_id' => $this->client_company_id,
            'invoice_number' => $this->invoice_number,
            'invoice_total' => $this->invoice_total,
            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'paid_date' => $this->paid_date?->toDateString(),
            'status' => $this->status,
            'invoice_kind' => $this->invoiceKindValue(),
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'cycle_start' => $this->cycle_start?->toDateString(),
            'cycle_end' => $this->cycle_end?->toDateString(),
            'retainer_hours_included' => $this->retainer_hours_included,
            'hours_worked' => $this->hours_worked,
            'carried_in_hours' => $hoursBreakdown->carriedInHours,
            'current_month_hours' => $hoursBreakdown->currentMonthHours,
            'negative_offset' => $negativeOffset,
            'rollover_hours_used' => $this->rollover_hours_used,
            'unused_hours_balance' => $this->unused_hours_balance,
            'negative_hours_balance' => $this->negative_hours_balance,
            'starting_unused_hours' => $this->starting_unused_hours,
            'starting_negative_hours' => $this->starting_negative_hours,
            'hours_billed_at_rate' => $this->hours_billed_at_rate,
            'notes' => $this->notes,
            'payments' => $this->payments->toArray(),
            'stripe_payments' => $this->stripePayments
                ->sortByDesc('created_at')
                ->values()
                ->map(fn (ClientInvoiceStripePayment $payment) => $payment->toActivityArray())
                ->all(),
            'payments_total' => $this->formatMoneyForPayload($paymentsTotal),
            'remaining_balance' => $this->formatMoneyForPayload((float) $this->remaining_balance),
            'credit_applied' => $creditApplied,
            'overpaid_amount' => $overpaidAmount,
            'available_credit_after' => $availableCreditAfter,
            'deferred_pending' => $deferredPending,
            'agreement' => $this->agreement ? [
                'id' => $this->agreement->id,
                'monthly_retainer_hours' => $this->agreement->monthly_retainer_hours,
                'monthly_retainer_fee' => $this->agreement->monthly_retainer_fee,
                'retainer_fee' => $this->agreement->retainer_fee,
                'retainer_hours' => $this->agreement->retainer_hours,
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
                    'client_agreement_recurring_item_id' => $line->client_agreement_recurring_item_id,
                    'time_entries_count' => $line->timeEntries->count(),
                    'time_entries' => $line->timeEntries->map(function ($entry) {
                        return [
                            'name' => $entry->name,
                            'minutes_worked' => $entry->minutes_worked,
                            'date_worked' => $entry->date_worked?->toDateString(),
                            'is_deferred_billing' => (bool) $entry->is_deferred_billing,
                        ];
                    })->toArray(),
                ];
            })->toArray(),
        ];
    }

    /**
     * Return adjacent invoice IDs for portal previous/next navigation.
     *
     * @return array{previous_invoice_id: int|null, next_invoice_id: int|null}
     */
    public function portalNavigationIds(bool $includeDrafts = false): array
    {
        return [
            'previous_invoice_id' => $this->portalAdjacentInvoiceId(previous: true, includeDrafts: $includeDrafts),
            'next_invoice_id' => $this->portalAdjacentInvoiceId(previous: false, includeDrafts: $includeDrafts),
        ];
    }

    private function portalAdjacentInvoiceId(bool $previous, bool $includeDrafts): ?int
    {
        $query = self::query()
            ->where('client_company_id', $this->client_company_id)
            ->when(! $includeDrafts, fn (Builder $query): Builder => $query->visibleToClientPortal());

        $operator = $previous ? '<' : '>';
        $direction = $previous ? 'desc' : 'asc';

        $invoiceId = $query
            ->where(function (Builder $query) use ($operator): void {
                $query->where('period_start', $operator, $this->period_start)
                    ->orWhere(function (Builder $query) use ($operator): void {
                        $query->where('period_start', '=', $this->period_start)
                            ->where('client_invoice_id', $operator, $this->client_invoice_id);
                    });
            })
            ->orderBy('period_start', $direction)
            ->orderBy('client_invoice_id', $direction)
            ->value('client_invoice_id');

        return $invoiceId === null ? null : (int) $invoiceId;
    }

    /**
     * Get the route key for the model.
     */
    public function getRouteKeyName(): string
    {
        return 'client_invoice_id';
    }

    /**
     * Build the deferred-work list surfaced in the invoice detail UI.
     *
     * Draft invoices show all outstanding deferred work through this period so
     * admins can see what is rolling forward. Issued and paid invoices show
     * deferred work from their own work period that was not billed on this
     * invoice, even if it has since been linked to a future invoice.
     *
     * Void and canceled invoices intentionally return no deferred-work rows:
     * there is no actionable invoice-period billing state to explain.
     *
     * @return list<array{id: int, hours: float, date_worked: string, name: string|null, billed_invoice: array{id: int, invoice_number: string|null, issue_date: string|null}|null}>
     */
    protected function buildDeferredPendingList(): array
    {
        if ($this->status === 'draft') {
            return $this->buildOutstandingDeferredList();
        }

        if (! in_array((string) $this->status, ['issued', 'paid'], true)) {
            return [];
        }

        return $this->buildOriginalPeriodDeferredList();
    }

    /**
     * @return list<array{id: int, hours: float, date_worked: string, name: string|null, billed_invoice: null}>
     */
    protected function buildOutstandingDeferredList(): array
    {
        // Delegate to the allocator in "skipped" mode: use a capacity of 0
        // so every outstanding deferred entry is reported (for UI only; this
        // does not mutate any data).
        $result = (new DeferredBillingAllocator)->allocate(
            $this->clientCompany,
            $this->period_end,
            remainingCapacityHours: 0.0,
        );

        return collect($result->skipped)
            ->map(fn (array $entry): array => [
                'id' => (int) $entry['id'],
                'hours' => (float) $entry['hours'],
                'date_worked' => (string) $entry['date_worked'],
                'name' => $entry['name'] ?? null,
                'billed_invoice' => null,
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array{id: int, hours: float, date_worked: string, name: string|null, billed_invoice: array{id: int, invoice_number: string|null, issue_date: string|null}|null}>
     */
    protected function buildOriginalPeriodDeferredList(): array
    {
        if (! $this->period_start || ! $this->period_end) {
            return [];
        }

        $invoiceLineIds = $this->lineItems->pluck('client_invoice_line_id')->all();

        return ClientTimeEntry::query()
            ->where('client_company_id', $this->client_company_id)
            ->where('is_billable', true)
            ->where('is_deferred_billing', true)
            ->whereBetween('date_worked', [$this->period_start, $this->period_end])
            ->with('invoiceLine.invoice')
            ->when($invoiceLineIds !== [], function ($query) use ($invoiceLineIds) {
                $query->where(function ($subQuery) use ($invoiceLineIds) {
                    $subQuery
                        ->whereNull('client_invoice_line_id')
                        ->orWhereNotIn('client_invoice_line_id', $invoiceLineIds);
                });
            })
            ->orderBy('date_worked', 'asc')
            ->orderBy('id', 'asc')
            ->get()
            ->map(fn (ClientTimeEntry $entry) => $this->summariseDeferredEntry($entry))
            ->values()
            ->all();
    }

    /**
     * @return array{id: int, hours: float, date_worked: string, name: string|null, billed_invoice: array{id: int, invoice_number: string|null, issue_date: string|null}|null}
     */
    protected function summariseDeferredEntry(ClientTimeEntry $entry): array
    {
        $summary = [
            'id' => (int) $entry->id,
            'hours' => round(((int) $entry->minutes_worked) / 60, 4),
            'date_worked' => $entry->date_worked->format('Y-m-d'),
            'name' => $entry->name,
            'billed_invoice' => null,
        ];

        $futureInvoice = $entry->invoiceLine?->invoice;
        if ($futureInvoice && $futureInvoice->client_invoice_id !== $this->client_invoice_id) {
            $summary['billed_invoice'] = [
                'id' => (int) $futureInvoice->client_invoice_id,
                'invoice_number' => $futureInvoice->invoice_number,
                'issue_date' => $futureInvoice->issue_date?->toDateString(),
            ];
        }

        return $summary;
    }

    private function formatMoneyForPayload(float $amount): string
    {
        return number_format(round($amount, 2), 2, '.', '');
    }
}
