<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientInvoicePayment extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_invoice_payments';

    protected $primaryKey = 'client_invoice_payment_id';

    protected $fillable = [
        'client_invoice_id',
        'amount',
        'payment_date',
        'payment_method',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
    ];

    public function invoice()
    {
        return $this->belongsTo(ClientInvoice::class, 'client_invoice_id', 'client_invoice_id');
    }
}
