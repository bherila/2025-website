<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinPartnershipBasisYear extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_partnership_basis_years';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'is_stale' => 'boolean',
            'locked_at' => 'datetime',
            'unlocked_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<FinPartnershipInterest, $this> */
    public function partnershipInterest(): BelongsTo
    {
        return $this->belongsTo(FinPartnershipInterest::class, 'partnership_interest_id');
    }
}
