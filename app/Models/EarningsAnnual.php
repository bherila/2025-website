<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EarningsAnnual extends Model
{
    protected $table = 'earnings_annual';

    public $incrementing = false;

    protected $fillable = [
        'symbol',
        'fiscalDateEnding',
        'reportedEPS',
    ];

    protected function casts(): array
    {
        return [
            'fiscalDateEnding' => 'date',
            'reportedEPS' => 'decimal:4',
        ];
    }
}
