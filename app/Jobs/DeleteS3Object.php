<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Storage;

/**
 * Queued job to delete a single S3 object.
 * Dispatched from the deleting model event on file-backed models
 * (FileForTaxDocument, FileForFinAccount) so that S3 objects are
 * cleaned up even when records are removed via cascade or bulk operations.
 */
class DeleteS3Object implements ShouldQueue
{
    use InteractsWithQueue, Queueable;

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
}
