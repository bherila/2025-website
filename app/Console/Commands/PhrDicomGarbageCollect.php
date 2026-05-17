<?php

namespace App\Console\Commands;

use App\Models\PhrDicomFile;
use App\Models\PhrDicomUpload;
use App\Services\PHR\DICOM\DicomUploadProcessor;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Throwable;

class PhrDicomGarbageCollect extends Command
{
    protected $signature = 'phr:dicom:gc {--pending-hours=6 : Mark pending uploads older than this as failed and reclaim their objects}
                                         {--dry-run : Report what would be deleted without making changes}';

    protected $description = 'Reclaim PHR DICOM storage objects that have no matching upload row or belong to stuck pending uploads.';

    public function __construct(private readonly DicomUploadProcessor $uploadProcessor)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $pendingHours = max(1, (int) $this->option('pending-hours'));
        $cutoff = Carbon::now()->subHours($pendingHours);

        if ($dryRun) {
            $this->warn('DRY RUN — no changes will be made.');
        }

        $stalePending = $this->failStalePendingUploads($cutoff, $dryRun);
        $orphanedObjects = $this->reclaimOrphanedObjects($dryRun);

        $this->info(sprintf(
            'PHR DICOM gc complete: %d pending upload(s) finalized, %d storage object(s) reclaimed.',
            $stalePending,
            $orphanedObjects,
        ));

        return self::SUCCESS;
    }

    /**
     * Walk uploads that have been STATUS_PENDING longer than the cutoff and
     * route them through DicomUploadProcessor::failUpload so cleanup is
     * identical to the in-request rollback path.
     */
    private function failStalePendingUploads(Carbon $cutoff, bool $dryRun): int
    {
        $count = 0;

        $uploads = PhrDicomUpload::query()
            ->where('status', PhrDicomUpload::STATUS_PENDING)
            ->where('updated_at', '<', $cutoff)
            ->get();

        foreach ($uploads as $upload) {
            $this->line("  Stale pending upload #{$upload->id} (prefix={$upload->r2_prefix})");
            $count++;

            if ($dryRun) {
                continue;
            }

            $this->uploadProcessor->failUpload($upload, 'Marked failed by phr:dicom:gc after pending timeout.');
        }

        return $count;
    }

    /**
     * List storage keys with no matching phr_dicom_files row and delete them.
     */
    private function reclaimOrphanedObjects(bool $dryRun): int
    {
        $disk = $this->uploadProcessor->disk();

        try {
            $keys = $disk->allFiles('phr/dicom');
        } catch (Throwable $error) {
            $this->error('Failed to list DICOM storage: '.$error->getMessage());

            return 0;
        }

        if ($keys === []) {
            return 0;
        }

        $count = 0;
        foreach (array_chunk($keys, 500) as $keyBatch) {
            $knownSet = array_flip(PhrDicomFile::query()
                ->whereIn('r2_key', $keyBatch)
                ->pluck('r2_key')
                ->all());

            foreach ($keyBatch as $key) {
                if (isset($knownSet[$key])) {
                    continue;
                }

                $this->line("  Orphan object: {$key}");
                $count++;

                if ($dryRun) {
                    continue;
                }

                try {
                    $disk->delete($key);
                } catch (Throwable $error) {
                    $this->error("    Failed to delete [{$key}]: ".$error->getMessage());
                }
            }
        }

        return $count;
    }
}
