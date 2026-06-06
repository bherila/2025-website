<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\CareerComparisonFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int|null $user_id
 * @property string|null $title
 * @property bool $is_snapshot
 * @property Carbon|null $last_active_at
 * @property int|null $current_job_id
 * @property list<int> $hypothetical_job_ids
 * @property string $short_code
 * @property bool $share_includes_current
 * @property array<string, mixed>|null $computed_json
 */
class CareerComparison extends Model
{
    /** @use HasFactory<CareerComparisonFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $table = 'opportunity_cost_comparisons';

    protected $fillable = [
        'user_id',
        'title',
        'is_snapshot',
        'last_active_at',
        'current_job_id',
        'hypothetical_job_ids',
        'short_code',
        'share_includes_current',
        'computed_json',
    ];

    protected function casts(): array
    {
        return [
            'hypothetical_job_ids' => 'array',
            'computed_json' => 'array',
            'share_includes_current' => 'boolean',
            'is_snapshot' => 'boolean',
            'last_active_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<CareerJob, $this>
     */
    public function currentJob(): BelongsTo
    {
        return $this->belongsTo(CareerJob::class, 'current_job_id');
    }
}
