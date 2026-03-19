<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class FinEmploymentEntity extends Model
{
    protected $table = 'fin_employment_entity';

    public const VALID_TYPES = ['sch_c', 'w2', 'hobby'];

    protected $fillable = [
        'user_id',
        'display_name',
        'start_date',
        'end_date',
        'is_current',
        'ein',
        'address',
        'type',
        'sic_code',
        'is_spouse',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'is_current' => 'boolean',
            'is_spouse' => 'boolean',
            'sic_code' => 'integer',
        ];
    }

    public function payslips()
    {
        return $this->hasMany(FinPayslips::class, 'employment_entity_id');
    }

    public function tags()
    {
        return $this->hasMany(FinAccountTag::class, 'employment_entity_id');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (! auth()->check()) {
                throw new \Exception('Authentication required to create employment entity');
            }
            if ($model->user_id && $model->user_id != auth()->id()) {
                throw new \Exception('Cannot set user_id to a different user');
            }
            $model->user_id = auth()->id();
        });

        static::addGlobalScope('user', function (Builder $builder) {
            if (auth()->check()) {
                $builder->where('fin_employment_entity.user_id', auth()->id());
            } else {
                $builder->whereRaw('1 = 0');
            }
        });
    }
}
