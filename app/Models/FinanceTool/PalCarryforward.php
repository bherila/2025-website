<?php

namespace App\Models\FinanceTool;

use Database\Factories\FinanceTool\PalCarryforwardFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property string $activity_name
 * @property string|null $activity_ein
 * @property float $ordinary_carryover
 * @property float $short_term_carryover
 * @property float $long_term_carryover
 */
class PalCarryforward extends Model
{
    /** @use HasFactory<PalCarryforwardFactory> */
    use HasFactory;

    protected $table = 'fin_pal_carryforwards';

    protected $fillable = [
        'user_id',
        'tax_year',
        'activity_name',
        'activity_ein',
        'ordinary_carryover',
        'short_term_carryover',
        'long_term_carryover',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'ordinary_carryover' => 'float',
            'short_term_carryover' => 'float',
            'long_term_carryover' => 'float',
        ];
    }
}
