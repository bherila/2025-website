<?php

namespace App\Models\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A recurring fixed-fee item attached to a client agreement.
 *
 * Examples: web hosting, software licenses, domain renewals. Each item has its
 * own charge cadence (which may differ from the agreement's billing cadence)
 * and an anchor date controlling when within the cycle the incidence falls.
 */
class ClientAgreementRecurringItem extends Model
{
    use SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_agreement_recurring_items';

    protected $fillable = [
        'client_agreement_id',
        'description',
        'amount',
        'charge_cadence',
        'anchor_month',
        'anchor_day',
        'start_date',
        'end_date',
        'is_taxable',
        'is_summarized',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'charge_cadence' => ChargeCadence::class,
        'anchor_month' => 'integer',
        'anchor_day' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'is_taxable' => 'boolean',
        'is_summarized' => 'boolean',
    ];

    /**
     * Get the agreement this item belongs to.
     *
     * @return BelongsTo<ClientAgreement, $this>
     */
    public function agreement(): BelongsTo
    {
        return $this->belongsTo(ClientAgreement::class, 'client_agreement_id');
    }

    /**
     * Get the invoice lines generated from this recurring item.
     *
     * @return HasMany<ClientInvoiceLine, $this>
     */
    public function invoiceLines(): HasMany
    {
        return $this->hasMany(ClientInvoiceLine::class, 'client_agreement_recurring_item_id', 'id');
    }
}
