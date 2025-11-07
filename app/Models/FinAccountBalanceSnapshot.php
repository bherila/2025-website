<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinAccountBalanceSnapshot extends Model
{
    protected $table = 'fin_account_balance_snapshot';

    protected $primaryKey = 'snapshot_id';

    protected $fillable = [
        'acct_id',
        'balance',
        'when_added',
    ];

    protected function casts(): array
    {
        return [
            'when_added' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }
}
