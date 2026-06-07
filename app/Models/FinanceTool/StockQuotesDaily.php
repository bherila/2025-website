<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;

class StockQuotesDaily extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'stock_quotes_daily';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'c_date',
        'c_symb',
        'c_open',
        'c_high',
        'c_low',
        'c_close',
        'c_vol',
    ];

    protected function casts(): array
    {
        return [
            'c_date' => 'date',
            'c_open' => 'decimal:4',
            'c_high' => 'decimal:4',
            'c_low' => 'decimal:4',
            'c_close' => 'decimal:4',
        ];
    }
}
