<?php

namespace App\GenAiProcessor\Models;

use App\Models\FinanceTool\FinAccounts;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class GenAiImportJob extends Model
{
    protected $table = 'genai_import_jobs';

    public const VALID_JOB_TYPES = [
        'finance_transactions',
        'finance_payslip',
        'utility_bill',
        'tax_document',
    ];

    public const VALID_STATUSES = [
        'pending',
        'processing',
        'parsed',
        'imported',
        'failed',
        'queued_tomorrow',
    ];

    public const MAX_RETRIES = 3;

    protected $fillable = [
        'user_id',
        'ai_configuration_id',
        'acct_id',
        'job_type',
        'file_hash',
        'original_filename',
        's3_path',
        'mime_type',
        'file_size_bytes',
        'context_json',
        'status',
        'error_message',
        'raw_response',
        'retry_count',
        'scheduled_for',
        'parsed_at',
        'input_tokens',
        'output_tokens',
    ];

    protected $casts = [
        'file_size_bytes' => 'integer',
        'retry_count' => 'integer',
        'scheduled_for' => 'date',
        'parsed_at' => 'datetime',
        'input_tokens' => 'integer',
        'output_tokens' => 'integer',
    ];

    protected static function boot(): void
    {
        parent::boot();

        // Always clean up the S3 file when a job record is deleted.
        static::deleting(function (self $job): void {
            if (! empty($job->s3_path)) {
                try {
                    Storage::disk('s3')->delete($job->s3_path);
                } catch (\Throwable $e) {
                    Log::warning('Failed to delete S3 file for GenAI job during model delete', [
                        'job_id' => $job->id,
                        's3_path' => $job->s3_path,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        });
    }

    /**
     * @return BelongsTo<User, self>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<FinAccounts, self>
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }

    /**
     * @return HasMany<GenAiImportResult, self>
     */
    public function results(): HasMany
    {
        return $this->hasMany(GenAiImportResult::class, 'job_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function getContextArray(): array
    {
        if (empty($this->context_json)) {
            return [];
        }

        return json_decode($this->context_json, true) ?? [];
    }

    public function canRetry(): bool
    {
        return $this->retry_count < self::MAX_RETRIES && $this->status === 'failed';
    }

    public function markProcessing(): void
    {
        $this->update(['status' => 'processing']);
    }

    public function markParsed(): void
    {
        $this->update([
            'status' => 'parsed',
            'parsed_at' => now(),
        ]);
    }

    public function markFailed(string $errorMessage): void
    {
        $this->update([
            'status' => 'failed',
            'error_message' => $errorMessage,
            'retry_count' => $this->retry_count + 1,
        ]);
    }

    public function markQueuedTomorrow(): void
    {
        $this->update([
            'status' => 'queued_tomorrow',
            'scheduled_for' => now()->utc()->addDay()->startOfDay(),
        ]);
    }

    public function markImported(): void
    {
        $this->update(['status' => 'imported']);
    }
}
