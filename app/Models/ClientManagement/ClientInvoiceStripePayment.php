<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientInvoiceStripePaymentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ClientInvoiceStripePayment extends Model
{
    /** @use HasFactory<ClientInvoiceStripePaymentFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'client_invoice_id',
        'stripe_payment_intent_id',
        'stripe_customer_id',
        'stripe_payment_method_id',
        'amount',
        'status',
        'failure_reason',
        'last_event_id',
    ];

    protected $casts = [
        'amount' => 'integer',
    ];

    /**
     * @return BelongsTo<ClientInvoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(ClientInvoice::class, 'client_invoice_id', 'client_invoice_id');
    }

    /**
     * @return HasOne<ClientInvoicePayment, $this>
     */
    public function invoicePayment(): HasOne
    {
        return $this->hasOne(ClientInvoicePayment::class, 'client_invoice_stripe_payment_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toActivityArray(): array
    {
        return [
            'id' => $this->id,
            'stripe_payment_intent_id' => $this->stripe_payment_intent_id,
            'stripe_payment_method_id' => $this->stripe_payment_method_id,
            'amount' => $this->amount,
            'status' => $this->status,
            'failure_reason' => $this->failure_reason,
            'last_event_id' => $this->last_event_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
