<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\OpportunityCostComparisonFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpportunityCostComparison extends Model
{
    /** @use HasFactory<OpportunityCostComparisonFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
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
