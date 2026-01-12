<?php

namespace App\Models\UtilityBillTracker;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UtilityAccount extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'utility_account';

    protected $fillable = [
        'user_id',
        'account_name',
        'account_type',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Get the bills for the utility account.
     */
    public function bills(): HasMany
    {
        return $this->hasMany(UtilityBill::class, 'utility_account_id');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (! auth()->check()) {
                throw new \Exception('Authentication required to create utility account');
            }
            if ($model->user_id && $model->user_id != auth()->id()) {
                throw new \Exception('Cannot set user_id to a different user');
            }
            $model->user_id = auth()->id();
        });

        static::addGlobalScope('user', function (Builder $builder) {
            if (auth()->check()) {
                $builder->where('user_id', auth()->id());
            } else {
                $builder->whereRaw('1 = 0');
            }
        });
    }
}
