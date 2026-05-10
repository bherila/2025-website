<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientInvoiceStripeEventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClientInvoiceStripeEvent extends Model
{
    /** @use HasFactory<ClientInvoiceStripeEventFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'stripe_event_id',
        'type',
        'payload',
        'processed_at',
        'error',
    ];

    protected $casts = [
        'payload' => 'array',
        'processed_at' => 'datetime',
    ];
}
