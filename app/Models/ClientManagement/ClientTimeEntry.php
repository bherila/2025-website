<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientTimeEntry extends Model
{
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_time_entries';

    protected $appends = ['is_invoiced', 'client_invoice', 'formatted_time'];

    protected $fillable = [
        'project_id',
        'client_company_id',
        'task_id',
        'name',
        'minutes_worked',
        'date_worked',
        'user_id',
        'creator_user_id',
        'is_billable',
        'is_deferred_billing',
        'job_type',
        'client_invoice_line_id',
    ];

    protected $casts = [
        'date_worked' => 'date',
        'is_billable' => 'boolean',
        'is_deferred_billing' => 'boolean',
        'minutes_worked' => 'integer',
    ];

    /**
     * Parse a time string like "1:30" or "1.5" into minutes.
     */
    public static function parseTimeToMinutes(string $timeString): int
    {
        $timeString = trim(strtolower($timeString));

        // Check for h:mm format
        if (preg_match('/^(\d+):(\d{1,2})$/', $timeString, $matches)) {
            $hours = (int) $matches[1];
            $minutes = (int) $matches[2];

            return ($hours * 60) + $minutes;
        }

        // Check for decimal hours format with optional 'h' suffix (e.g., 1.5 or 1.5h)
        if (preg_match('/^(\d*(?:\.\d+)?)h?$/', $timeString, $matches) && $matches[1] !== '') {
            $hours = (float) $matches[1];

            return (int) round($hours * 60);
        }

        return 0;
    }

    /**
     * Format minutes as h:mm string.
     */
    public static function formatMinutesAsTime(int $minutes): string
    {
        $hours = floor($minutes / 60);
        $mins = $minutes % 60;

        return sprintf('%d:%02d', $hours, $mins);
    }

    /**
     * Get the project this time entry belongs to.
     *
     * @return BelongsTo<ClientProject, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(ClientProject::class, 'project_id');
    }

    /**
     * Get the client company this time entry belongs to.
     *
     * @return BelongsTo<ClientCompany, $this>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the task this time entry is associated with.
     *
     * @return BelongsTo<ClientTask, $this>
     */
    public function task(): BelongsTo
    {
        return $this->belongsTo(ClientTask::class, 'task_id');
    }

    /**
     * Get the user who did the work.
     *
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Get the user who created this time entry.
     *
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * Get the invoice line this time entry is linked to.
     *
     * @return BelongsTo<ClientInvoiceLine, $this>
     */
    public function invoiceLine(): BelongsTo
    {
        return $this->belongsTo(ClientInvoiceLine::class, 'client_invoice_line_id', 'client_invoice_line_id');
    }

    /**
     * Check if this time entry is linked to any invoice (draft or issued).
     */
    public function isLinkedToInvoice(): bool
    {
        return $this->client_invoice_line_id !== null;
    }

    /**
     * Scope a query to only deferred-billing entries.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeDeferred(Builder $query): Builder
    {
        return $query->where('is_deferred_billing', true);
    }

    /**
     * Scope a query to only non-deferred entries (the default billing path).
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeNotDeferred(Builder $query): Builder
    {
        return $query->where('is_deferred_billing', false);
    }

    /**
     * Eager-load the compact invoice context used by portal time-entry payloads.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeWithPortalInvoiceContext(Builder $query): Builder
    {
        return $query->with([
            'invoiceLine:client_invoice_line_id,client_invoice_id',
            'invoiceLine.invoice:client_invoice_id,invoice_number,status,issue_date',
        ]);
    }

    /**
     * Check if this time entry is on an issued or paid invoice (not editable).
     */
    public function isOnIssuedInvoice(): bool
    {
        if (! $this->client_invoice_line_id) {
            return false;
        }
        $this->loadMissing('invoiceLine.invoice');
        $invoice = $this->invoiceLine?->invoice;

        return $invoice && in_array($invoice->status, ClientInvoice::CLIENT_VISIBLE_STATUSES, true);
    }

    /**
     * Check if this time entry has been invoiced (on an issued/paid invoice).
     * For backwards compatibility, this returns true only for non-draft invoices.
     */
    public function isInvoiced(): bool
    {
        return $this->isOnIssuedInvoice();
    }

    /**
     * Accessor for is_invoiced attribute.
     * Returns true only for entries on issued/paid invoices.
     */
    public function getIsInvoicedAttribute(): bool
    {
        return $this->isOnIssuedInvoice();
    }

    /**
     * Get the formatted time string.
     */
    public function getFormattedTimeAttribute(): string
    {
        return self::formatMinutesAsTime($this->minutes_worked);
    }

    /**
     * Get the compact invoice context used by portal time-entry payloads.
     *
     * @return array{client_invoice_id: int, invoice_number: string|null, invoice_date: string|null, status: string}|null
     */
    public function getClientInvoiceAttribute(): ?array
    {
        $invoice = $this->invoiceLine?->invoice;
        if (! $invoice) {
            return null;
        }

        return [
            'client_invoice_id' => (int) $invoice->client_invoice_id,
            'invoice_number' => $invoice->invoice_number,
            'invoice_date' => $invoice->issue_date?->toDateString(),
            'status' => (string) $invoice->status,
        ];
    }
}
