<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Database\Factories\FinanceTool\FinScheduleCInputFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $employment_entity_id
 * @property int $tax_year
 * @property float $gross_receipts
 * @property float $returns_and_allowances
 * @property float|null $other_income
 */
class FinScheduleCInput extends Model
{
    /** @use HasFactory<FinScheduleCInputFactory> */
    use HasFactory;

    protected $table = 'fin_schedule_c_inputs';

    protected $fillable = [
        'user_id',
        'employment_entity_id',
        'tax_year',
        'gross_receipts',
        'returns_and_allowances',
        'other_income',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'gross_receipts' => 'float',
            'returns_and_allowances' => 'float',
            'other_income' => 'float',
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
