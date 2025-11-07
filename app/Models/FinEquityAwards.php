<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinEquityAwards extends Model
{
    protected $table = 'fin_equity_awards';

    protected $fillable = [
        'award_id',
        'grant_date',
        'vest_date',
        'share_count',
        'symbol',
        'uid',
        'vest_price',
    ];

    protected function casts(): array
    {
        return [
            'vest_price' => 'decimal:2',
        ];
    }
}
