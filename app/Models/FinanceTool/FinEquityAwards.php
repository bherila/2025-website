<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;

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
    ];

    protected function casts(): array
    {
        return [
            'share_count' => 'integer',
            'grant_price' => 'decimal:2',
            'vest_price' => 'decimal:2',
        ];
    }
}
