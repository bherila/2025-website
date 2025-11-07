<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EarningsQuarterly extends Model
{
    protected $table = 'earnings_quarterly';

    public $incrementing = false;

    protected $fillable = [
        'symbol',
        'fiscalDateEnding',
        'reportedDate',
        'reportedEPS',
        'estimatedEPS',
        'surprise',
        'surprisePercentage',
    ];

    protected function casts(): array
    {
        return [
            'fiscalDateEnding' => 'date',
            'reportedDate' => 'date',
            'reportedEPS' => 'decimal:4',
            'estimatedEPS' => 'decimal:4',
            'surprise' => 'decimal:4',
            'surprisePercentage' => 'decimal:4',
        ];
    }
}
