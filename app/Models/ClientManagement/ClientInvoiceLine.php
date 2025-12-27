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
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'hours' => 'decimal:4',
        'sort_order' => 'integer',
    ];

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
     * Calculate and update the line total.
     */
    public function calculateTotal(): void
    {
        $this->line_total = $this->quantity * $this->unit_price;
        $this->save();
    }
}
