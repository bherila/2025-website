<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientTimeEntry extends Model
{
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_time_entries';

    protected $appends = ['is_invoiced', 'client_invoice'];

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
        'job_type',
        'client_invoice_line_id',
    ];

    protected $casts = [
        'date_worked' => 'date',
        'is_billable' => 'boolean',
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
     */
    public function project()
    {
        return $this->belongsTo(ClientProject::class, 'project_id');
    }

    /**
     * Get the client company this time entry belongs to.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the task this time entry is associated with.
     */
    public function task()
    {
        return $this->belongsTo(ClientTask::class, 'task_id');
    }

    /**
     * Get the user who did the work.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Get the user who created this time entry.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    /**
     * Get the invoice line this time entry is linked to.
     */
    public function invoiceLine()
    {
        return $this->belongsTo(ClientInvoiceLine::class, 'client_invoice_line_id', 'client_invoice_line_id');
    }

    /**
     * Check if this time entry has been invoiced.
     */
    public function isInvoiced(): bool
    {
        return $this->client_invoice_line_id !== null;
    }

    /**
     * Accessor for is_invoiced attribute.
     */
    public function getIsInvoicedAttribute(): bool
    {
        return $this->isInvoiced();
    }

    /**
     * Get the formatted time string.
     */
    public function getFormattedTimeAttribute(): string
    {
        return self::formatMinutesAsTime($this->minutes_worked);
    }

    /**
     * Get the associated invoice via the line item.
     */
    public function getClientInvoiceAttribute()
    {
        return $this->invoiceLine?->invoice;
    }
}
