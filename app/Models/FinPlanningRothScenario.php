<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinPlanningRothScenarioFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinPlanningRothScenario extends Model
{
    /** @use HasFactory<FinPlanningRothScenarioFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'short_code',
        'title',
        'inputs_json',
        'computed_json',
    ];

    protected function casts(): array
    {
        return [
            'inputs_json' => 'array',
            'computed_json' => 'array',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
