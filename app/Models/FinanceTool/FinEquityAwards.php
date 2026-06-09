<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinEquityAwards extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_equity_awards';

    public $timestamps = false;

    protected $fillable = [
        'award_id',
        'grant_date',
        'vest_date',
        'share_count',
        'symbol',
        'uid',
        'grant_price',
        'vest_price',
        'vest_price_source',
        'vest_price_fetched_at',
        'grant_price_source',
        'grant_price_fetched_at',
    ];

    protected function casts(): array
    {
        return [
            'share_count' => 'decimal:6',
            'grant_price' => 'decimal:6',
            'vest_price' => 'decimal:6',
            'vest_price_fetched_at' => 'datetime',
            'grant_price_fetched_at' => 'datetime',
        ];
    }

    /** @return HasMany<FinRsuVestSettlementAllocation, $this> */
    public function settlementAllocations(): HasMany
    {
        return $this->hasMany(FinRsuVestSettlementAllocation::class, 'equity_award_id');
    }

    /** @return HasMany<FinRsuLink, $this> */
    public function rsuLinks(): HasMany
    {
        return $this->hasMany(FinRsuLink::class, 'equity_award_id');
    }
}
