<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class FinAccounts extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_accounts';

    protected $primaryKey = 'acct_id';

    protected $fillable = [
        'acct_owner',
        'acct_name',
        'acct_number',
        'acct_last_balance',
        'acct_last_balance_date',
        'acct_is_debt',
        'acct_is_retirement',
        'expected_fee_pct',
        'expected_fee_flat',
        'expected_fee_notes',
        'acct_capital_commitment',
        'acct_capital_commitment_currency',
        'acct_capital_commitment_date',
        'acct_capital_commitment_notes',
        'acct_sort_order',
        'when_closed',
    ];

    protected function casts(): array
    {
        return [
            'acct_last_balance_date' => 'datetime',
            'acct_is_debt' => 'boolean',
            'acct_is_retirement' => 'boolean',
            'expected_fee_pct' => 'decimal:4',
            'expected_fee_flat' => 'decimal:2',
            'acct_capital_commitment' => 'decimal:4',
            'acct_capital_commitment_date' => 'date',
            'when_closed' => 'datetime',
        ];
    }

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function ($model) {
            if (! auth()->check()) {
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

    /**
     * Scope to a specific owner, bypassing the auth-based global scope.
     *
     * Use this instead of `withoutGlobalScopes()->where('acct_owner', $userId)`
     * in CLI commands, queue jobs, and services where auth()->id() is unavailable.
     */
    public function scopeForOwner(Builder $query, int $userId): void
    {
        $query->withoutGlobalScopes()->where('acct_owner', $userId);
    }
}
