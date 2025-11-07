<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class FinAccounts extends Model
{
    protected $table = 'fin_accounts';

    protected $primaryKey = 'acct_id';

    protected $fillable = [
        'acct_owner',
        'acct_name',
        'acct_last_balance',
        'acct_last_balance_date',
        'acct_is_debt',
        'acct_is_retirement',
        'acct_sort_order',
        'when_closed',
        'when_deleted',
    ];

    protected function casts(): array
    {
        return [
            'acct_last_balance_date' => 'datetime',
            'acct_is_debt' => 'boolean',
            'acct_is_retirement' => 'boolean',
            'when_closed' => 'datetime',
            'when_deleted' => 'datetime',
        ];
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (!auth()->check()) {
                throw new \Exception('Authentication required to create account');
            }
            if ($model->acct_owner && $model->acct_owner != auth()->id()) {
                throw new \Exception('Cannot set acct_owner to a different user');
            }
            $model->acct_owner = auth()->id();
        });

        static::addGlobalScope('user', function (Builder $builder) {
            if (auth()->check()) {
                $builder->where('acct_owner', auth()->id());
            } else {
                $builder->whereRaw('1 = 0');
            }
        });
    }
}
