<?php

namespace App\Models\FinanceTool;

use Database\Factories\FinanceTool\FinEmploymentEntityYearFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $employment_entity_id
 * @property int $tax_year
 * @property string $accounting_method
 * @property bool $materially_participated
 * @property bool $made_payments_requiring_1099
 * @property bool|null $filed_required_1099s
 * @property bool $started_or_acquired_this_year
 * @property string|null $principal_product_service
 * @property string|null $business_code
 * @property string|null $notes
 */
class FinEmploymentEntityYear extends Model
{
    /** @use HasFactory<FinEmploymentEntityYearFactory> */
    use HasFactory;

    public const array ACCOUNTING_METHODS = ['cash', 'accrual', 'other'];

    protected $table = 'fin_employment_entity_year';

    protected $fillable = [
        'employment_entity_id',
        'tax_year',
        'accounting_method',
        'materially_participated',
        'made_payments_requiring_1099',
        'filed_required_1099s',
        'started_or_acquired_this_year',
        'principal_product_service',
        'business_code',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'materially_participated' => 'boolean',
            'made_payments_requiring_1099' => 'boolean',
            'filed_required_1099s' => 'boolean',
            'started_or_acquired_this_year' => 'boolean',
        ];
    }

    /** @return BelongsTo<FinEmploymentEntity, $this> */
    public function employmentEntity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }

    protected static function booted(): void
    {
        static::addGlobalScope('user', function (Builder $builder): void {
            if (auth()->check()) {
                $builder->whereHas('employmentEntity', function (Builder $query): void {
                    $query->where('user_id', auth()->id());
                });

                return;
            }

            $builder->whereRaw('1 = 0');
        });
    }
}
