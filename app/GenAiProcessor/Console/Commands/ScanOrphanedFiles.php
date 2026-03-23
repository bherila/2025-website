<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class ScanOrphanedFiles extends Command
{
    protected $signature = 'orphans:scan {--prefix=genai-import/}';

    protected $description = 'Scan S3 bucket for orphaned GenAI import files not referenced by any job';

    public function handle(): int
    {
        $prefix = $this->option('prefix');
        $this->info("Scanning S3 bucket for files under prefix: {$prefix}");

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

        // Get all known S3 paths from the database
        $knownPaths = GenAiImportJob::pluck('s3_path')->toArray();
        $knownPathsSet = array_flip($knownPaths);

        $orphans = [];
        foreach ($files as $file) {
            if (! isset($knownPathsSet[$file])) {
                $orphans[] = $file;
            }
        }

        if (empty($orphans)) {
            $this->info('No orphaned files found. All S3 files are referenced by jobs.');

            return self::SUCCESS;
        }

        $this->warn(count($orphans).' orphaned file(s) found:');
        foreach ($orphans as $orphan) {
            $this->line("  - {$orphan}");
        }

        $this->info('Run orphans:delete to remove these files.');

        return self::SUCCESS;
    }
}
