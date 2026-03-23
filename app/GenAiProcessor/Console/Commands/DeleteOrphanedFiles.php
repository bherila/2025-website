<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class DeleteOrphanedFiles extends Command
{
    protected $signature = 'orphans:delete {--prefix=genai-import/} {--dry-run}';

    protected $description = 'Delete orphaned GenAI import files from S3 that are not referenced by any job';

    public function handle(): int
    {
        $prefix = $this->option('prefix');
        $dryRun = $this->option('dry-run');

        $this->info("Scanning S3 bucket for orphaned files under prefix: {$prefix}");
        if ($dryRun) {
            $this->warn('DRY RUN — no files will be deleted.');
        }

        try {
            $files = Storage::disk('s3')->files($prefix, true);
        } catch (\Throwable $e) {
            $this->error('Failed to list S3 files: '.$e->getMessage());

            return self::FAILURE;
        }

        if (empty($files)) {
            $this->info('No files found in S3.');

            return self::SUCCESS;
        }

        $knownPaths = GenAiImportJob::pluck('s3_path')->toArray();
        $knownPathsSet = array_flip($knownPaths);

        $orphans = [];
        foreach ($files as $file) {
            if (! isset($knownPathsSet[$file])) {
                $orphans[] = $file;
            }
        }

        if (empty($orphans)) {
            $this->info('No orphaned files found.');

            return self::SUCCESS;
        }

        $this->warn(count($orphans).' orphaned file(s) to delete:');

        $deleted = 0;
        foreach ($orphans as $orphan) {
            if ($dryRun) {
                $this->line("  [DRY RUN] Would delete: {$orphan}");
            } else {
                try {
                    Storage::disk('s3')->delete($orphan);
                    $this->line("  Deleted: {$orphan}");
                    $deleted++;
                } catch (\Throwable $e) {
                    $this->error("  Failed to delete {$orphan}: ".$e->getMessage());
                }
            }
        }

        if (! $dryRun) {
            $this->info("Deleted {$deleted} orphaned file(s).");
        }

        return self::SUCCESS;
    }
}
