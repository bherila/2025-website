<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinPartnershipBasisEvent extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_partnership_basis_events';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'event_date' => 'date',
            'metadata' => 'array',
        ];
    }

    /** @return BelongsTo<FinPartnershipInterest, $this> */
    public function partnershipInterest(): BelongsTo
    {
        return $this->belongsTo(FinPartnershipInterest::class, 'partnership_interest_id');
    }
}
