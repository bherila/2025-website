<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinAccountLineItems extends Model
{
    protected $table = 'fin_account_line_items';

    protected $primaryKey = 't_id';

    protected $fillable = [
        't_account',
        't_date',
        't_date_posted',
        't_type',
        't_schc_category',
        't_amt',
        't_symbol',
        't_qty',
        't_price',
        't_commission',
        't_fee',
        't_method',
        't_source',
        't_origin',
        'opt_expiration',
        'opt_type',
        'opt_strike',
        't_description',
        't_comment',
        't_from',
        't_to',
        't_interest_rate',
        't_cusip',
        't_harvested_amount',
        'when_added',
        'when_deleted',
    ];

    protected function casts(): array
    {
        return [
            't_amt' => 'decimal:4',
            't_price' => 'decimal:4',
            't_commission' => 'decimal:4',
            't_fee' => 'decimal:4',
            'opt_strike' => 'decimal:4',
            't_harvested_amount' => 'decimal:4',
            'when_added' => 'datetime',
            'when_deleted' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 't_account', 'acct_id');
    }

    public function tags(): HasMany
    {
        return $this->hasMany(FinAccountLineItemTagMap::class, 't_id');
    }
}
