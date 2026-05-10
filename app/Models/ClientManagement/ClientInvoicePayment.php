<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        'client_invoice_stripe_payment_id',
        'stripe_payment_intent_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
    ];

    /**
     * @return BelongsTo<ClientInvoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(ClientInvoice::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * @return BelongsTo<ClientInvoiceStripePayment, $this>
     */
    public function stripePayment(): BelongsTo
    {
        return $this->belongsTo(ClientInvoiceStripePayment::class, 'client_invoice_stripe_payment_id');
    }
}
