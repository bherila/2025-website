<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class PHRPatientVitals extends Model
{
    protected $table = 'phr_patient_vitals';

    protected $fillable = [
        'user_id',
        'vital_name',
        'vital_date',
        'vital_value',
    ];

    protected function casts(): array
    {
        return [
            'vital_date' => 'date',
        ];
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (!auth()->check()) {
                throw new \Exception('Authentication required to create patient vital');
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
