<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Database\Factories\FinanceTool\FinTaxLineAdjustmentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tax line adjustments can either affect computed facts or serve as review metadata.
 *
 * Status semantics:
 * - open: active and still needs review; numeric overrides/adjustments are applied optimistically.
 * - applied: active and reviewed; numeric overrides/adjustments remain applied.
 * - resolved: inactive historical note; builders ignore it.
 *
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property string $form
 * @property int|null $entity_id
 * @property string $line_ref
 * @property string $kind
 * @property float|null $amount
 * @property string|null $description
 * @property string $status
 */
class FinTaxLineAdjustment extends Model
{
    /** @use HasFactory<FinTaxLineAdjustmentFactory> */
    use HasFactory;

    public const array FORMS = ['schedule_c', 'form_8829'];

    public const array KINDS = ['override', 'adjustment', 'supporting_detail', 'follow_up_flag'];

    public const array STATUSES = ['open', 'resolved', 'applied'];

    protected $table = 'fin_tax_line_adjustments';

    protected $fillable = [
        'user_id',
        'tax_year',
        'form',
        'entity_id',
        'line_ref',
        'kind',
        'amount',
        'description',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'entity_id' => 'integer',
            'amount' => 'float',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<FinEmploymentEntity, $this> */
    public function entity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'entity_id');
    }

    public function affectsAmount(): bool
    {
        return in_array($this->kind, ['override', 'adjustment'], true);
    }

    protected static function booted(): void
    {
        static::creating(function (self $adjustment): void {
            if (auth()->check() && empty($adjustment->user_id)) {
                $adjustment->user_id = (int) auth()->id();
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
