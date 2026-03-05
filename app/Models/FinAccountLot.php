<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinAccountLot extends Model
{
    protected $table = 'fin_account_lots';

    protected $primaryKey = 'lot_id';

    protected $fillable = [
        'acct_id',
        'symbol',
        'description',
        'quantity',
        'purchase_date',
        'cost_basis',
        'cost_per_unit',
        'sale_date',
        'proceeds',
        'realized_gain_loss',
        'is_short_term',
        'lot_source',
        'statement_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:8',
        'cost_basis' => 'decimal:4',
        'cost_per_unit' => 'decimal:8',
        'proceeds' => 'decimal:4',
        'realized_gain_loss' => 'decimal:4',
        'is_short_term' => 'boolean',
        'purchase_date' => 'date',
        'sale_date' => 'date',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }

    public function statement(): BelongsTo
    {
        return $this->belongsTo(FinAccountBalanceSnapshot::class, 'statement_id', 'statement_id');
    }
}
