<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientInvoiceLine extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_invoice_lines';

    protected $primaryKey = 'client_invoice_line_id';

    protected $fillable = [
        'client_invoice_id',
        'client_agreement_id',
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'line_type',
        'hours',
        'line_date',
        'sort_order',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'hours' => 'decimal:4',
        'line_date' => 'date',
        'sort_order' => 'integer',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted()
    {
        static::deleting(function ($line) {
            // Unlink time entries linked to this line
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
            // Unlink expenses linked to this line
            $line->expenses()->update(['client_invoice_line_id' => null]);
        });
    }

    /**
     * Get the invoice this line belongs to.
     */
    public function invoice()
    {
        return $this->belongsTo(ClientInvoice::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * Get the agreement this line is associated with.
     */
    public function agreement()
    {
        return $this->belongsTo(ClientAgreement::class, 'client_agreement_id');
    }

    /**
     * Get the time entries linked to this invoice line.
     */
    public function timeEntries()
    {
        return $this->hasMany(ClientTimeEntry::class, 'client_invoice_line_id', 'client_invoice_line_id');
    }

    /**
     * Get the expenses linked to this invoice line.
     */
    public function expenses()
    {
        return $this->hasMany(ClientExpense::class, 'client_invoice_line_id', 'client_invoice_line_id');
    }

    /**
     * Calculate and update the line total.
     */
    public function calculateTotal(): void
    {
        $this->line_total = $this->quantity * $this->unit_price;
        $this->save();
    }
}
