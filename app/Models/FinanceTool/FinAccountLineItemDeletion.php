<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinAccountLineItemDeletion extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_account_line_item_deletions';

    protected $fillable = [
        't_id',
        't_account',
        'user_id',
        'deleted_at',
    ];

    protected $casts = [
        'deleted_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<FinAccounts, $this>
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 't_account', 'acct_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
}
