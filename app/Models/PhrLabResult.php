<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class PhrLabResult extends Model
{
    protected $table = 'phr_lab_results';

    protected $fillable = [
        'user_id',
        'test_name',
        'collection_datetime',
        'result_datetime',
        'result_status',
        'ordering_provider',
        'resulting_lab',
        'analyte',
        'value',
        'unit',
        'range_min',
        'range_max',
        'range_unit',
        'normal_value',
        'message_from_provider',
        'result_comment',
        'lab_director',
    ];

    protected function casts(): array
    {
        return [
            'collection_datetime' => 'datetime',
            'result_datetime' => 'datetime',
            'range_min' => 'decimal:2',
            'range_max' => 'decimal:2',
        ];
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (!auth()->check()) {
                throw new \Exception('Authentication required to create lab result');
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
