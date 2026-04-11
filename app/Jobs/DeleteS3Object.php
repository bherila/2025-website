<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Queued job to delete a single S3 object.
 * Dispatched from the deleting model event on file-backed models
 * (FileForTaxDocument, FileForFinAccount) so that S3 objects are
 * cleaned up when records are removed via Eloquent single-model deletes.
 *
 * NOTE: this job is NOT dispatched for bulk deletes (e.g. Model::where()->delete()
 * or DB::table()->delete()), which bypass Eloquent model events. Any code that
 * bulk-deletes rows from file-backed tables must dispatch this job manually.
 *
 * Illuminate\Foundation\Queue\Queueable already pulls in Dispatchable,
 * InteractsWithQueue, and SerializesModels — dispatch() is available without
 * adding those traits explicitly.
 */
class DeleteS3Object implements ShouldQueue
{
    use Queueable;

    /** Retry up to 5 times before marking the job as failed. */
    public int $tries = 5;

    /** Back off 30 s between retries. */
    public int $backoff = 30;

    public function __construct(
        public readonly string $s3Path,
        public readonly string $disk = 's3',
    ) {}

    public function handle(): void
    {
        if ($this->s3Path === '') {
            return;
        }

        Storage::disk($this->disk)->delete($this->s3Path);
    }

    public function failed(\Throwable $e): void
    {
        Log::error('DeleteS3Object: permanent failure — S3 object may be orphaned', [
            's3_path' => $this->s3Path,
            'disk' => $this->disk,
            'error' => $e->getMessage(),
        ]);
    }
}
