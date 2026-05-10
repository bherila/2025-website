<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinanceTool\ScheduleDCarryoverInputFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property float $short_term_loss_carryover
 * @property float $long_term_loss_carryover
 * @property string|null $notes
 */
class ScheduleDCarryoverInput extends Model
{
    /** @use HasFactory<ScheduleDCarryoverInputFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $table = 'fin_schedule_d_carryover_inputs';

    protected $fillable = [
        'user_id',
        'tax_year',
        'short_term_loss_carryover',
        'long_term_loss_carryover',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'short_term_loss_carryover' => 'float',
            'long_term_loss_carryover' => 'float',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
