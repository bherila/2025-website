<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Database\Factories\FinanceTool\FinForm8829InputFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $employment_entity_id
 * @property int $tax_year
 * @property string $method
 * @property float|null $office_sqft
 * @property float|null $home_sqft
 * @property int $months_used
 * @property float $prior_year_op_carryover
 * @property float $prior_year_op_carryover_ca
 * @property float $prior_year_depreciation_carryover
 * @property float $prior_year_depreciation_carryover_ca
 * @property string|null $notes
 */
class FinForm8829Input extends Model
{
    /** @use HasFactory<FinForm8829InputFactory> */
    use HasFactory;

    public const array METHODS = ['regular', 'simplified'];

    protected $table = 'fin_form_8829_inputs';

    protected $fillable = [
        'user_id',
        'employment_entity_id',
        'tax_year',
        'method',
        'office_sqft',
        'home_sqft',
        'months_used',
        'prior_year_op_carryover',
        'prior_year_op_carryover_ca',
        'prior_year_depreciation_carryover',
        'prior_year_depreciation_carryover_ca',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'office_sqft' => 'float',
            'home_sqft' => 'float',
            'months_used' => 'integer',
            'prior_year_op_carryover' => 'float',
            'prior_year_op_carryover_ca' => 'float',
            'prior_year_depreciation_carryover' => 'float',
            'prior_year_depreciation_carryover_ca' => 'float',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<FinEmploymentEntity, $this> */
    public function employmentEntity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }

    protected static function booted(): void
    {
        static::creating(function (self $input): void {
            if (auth()->check() && empty($input->user_id)) {
                $input->user_id = (int) auth()->id();
            }
        });

        static::addGlobalScope('user', function (Builder $builder): void {
            if (auth()->check()) {
                $builder->where('user_id', auth()->id());

                return;
            }

            $builder->whereRaw('1 = 0');
        });
    }
}
