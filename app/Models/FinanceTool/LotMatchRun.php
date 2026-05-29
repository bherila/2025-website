<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinanceTool\LotMatchRunFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LotMatchRun extends Model
{
    /** @use HasFactory<LotMatchRunFactory> */
    use HasFactory, SerializesDatesAsLocal;

    public const string STATUS_QUEUED = 'queued';

    public const string STATUS_RUNNING = 'running';

    public const string STATUS_SUCCEEDED = 'succeeded';

    public const string STATUS_FAILED = 'failed';

    public const string STATUS_SUPERSEDED = 'superseded';

    public const string MODE_PRESERVE = 'preserve';

    public const string MODE_FORCE = 'force';

    public const array STATUSES = [
        self::STATUS_QUEUED,
        self::STATUS_RUNNING,
        self::STATUS_SUCCEEDED,
        self::STATUS_FAILED,
        self::STATUS_SUPERSEDED,
    ];

    public const array MODES = [
        self::MODE_PRESERVE,
        self::MODE_FORCE,
    ];

    protected $fillable = [
        'document_id',
        'user_id',
        'status',
        'mode',
        'started_at',
        'finished_at',
        'result_summary',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'document_id' => 'integer',
            'user_id' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'result_summary' => 'array',
        ];
    }

    /** @return BelongsTo<FinDocument, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(FinDocument::class, 'document_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_QUEUED, self::STATUS_RUNNING], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'id' => (int) $this->id,
            'document_id' => (int) $this->document_id,
            'user_id' => (int) $this->user_id,
            'status' => (string) $this->status,
            'mode' => (string) $this->mode,
            'started_at' => $this->started_at,
            'finished_at' => $this->finished_at,
            'result_summary' => $this->result_summary,
            'error' => $this->error,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
