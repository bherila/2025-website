<?php

namespace App\Models\ClientManagement;

use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\ProposalItemKind;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A line item on a {@see ClientProposal}.
 *
 * `scope` items are unpriced deliverables that become tasks on acceptance.
 * `add_on` items are priced upsells: one-time add-ons become upfront invoice
 * lines; recurring add-ons become agreement recurring items.
 */
class ClientProposalItem extends Model
{
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_proposal_items';

    protected $fillable = [
        'client_proposal_id',
        'kind',
        'description',
        'amount',
        'charge_cadence',
        'is_optional',
        'is_selected',
        'sort_order',
    ];

    protected $casts = [
        'kind' => ProposalItemKind::class,
        'charge_cadence' => ChargeCadence::class,
        'amount' => 'decimal:2',
        'is_optional' => 'boolean',
        'is_selected' => 'boolean',
        'sort_order' => 'integer',
    ];

    /**
     * @return BelongsTo<ClientProposal, $this>
     */
    public function proposal(): BelongsTo
    {
        return $this->belongsTo(ClientProposal::class, 'client_proposal_id');
    }
}
