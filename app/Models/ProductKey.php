<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class ProductKey extends Model
{
    protected $table = 'product_keys';

    protected $fillable = [
        'uid',
        'product_id',
        'product_key',
        'product_name',
        'computer_name',
        'comment',
        'used_on',
        'claimed_date',
        'key_type',
        'key_retrieval_note',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (!auth()->check()) {
                throw new \Exception('Authentication required to create product key');
            }
            if ($model->uid && $model->uid != auth()->id()) {
                throw new \Exception('Cannot set uid to a different user');
            }
            $model->uid = auth()->id();
        });

        static::addGlobalScope('user', function (Builder $builder) {
            if (auth()->check()) {
                $builder->where('uid', auth()->id());
            } else {
                // If not authenticated, return no results
                $builder->whereRaw('1 = 0');
            }
        });
    }
}
