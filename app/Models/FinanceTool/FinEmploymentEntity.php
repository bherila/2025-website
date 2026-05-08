<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinEmploymentEntity extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_employment_entity';

    public const VALID_TYPES = ['sch_c', 'w2', 'hobby'];

    protected $attributes = [
        'is_hidden' => false,
    ];

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
        'is_hidden',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'is_current' => 'boolean',
            'is_spouse' => 'boolean',
            'is_hidden' => 'boolean',
            'sic_code' => 'integer',
        ];
    }

    /** @return HasMany<FinPayslips, $this> */
    public function payslips(): HasMany
    {
        return $this->hasMany(FinPayslips::class, 'employment_entity_id');
    }

    /** @return HasMany<FinAccountTag, $this> */
    public function tags(): HasMany
    {
        return $this->hasMany(FinAccountTag::class, 'employment_entity_id');
    }

    /** @return HasMany<FinEmploymentEntityYear, $this> */
    public function years(): HasMany
    {
        return $this->hasMany(FinEmploymentEntityYear::class, 'employment_entity_id');
    }

    /** @return HasMany<FinForm8829Input, $this> */
    public function form8829Inputs(): HasMany
    {
        return $this->hasMany(FinForm8829Input::class, 'employment_entity_id');
    }

    /** @return HasMany<FinTaxLineAdjustment, $this> */
    public function taxLineAdjustments(): HasMany
    {
        return $this->hasMany(FinTaxLineAdjustment::class, 'entity_id');
    }

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (self $model): void {
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
