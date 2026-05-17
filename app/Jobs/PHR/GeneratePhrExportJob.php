<?php

namespace App\Jobs\PHR;

use App\Models\PhrExport;
use App\Services\PHR\Export\PhrExportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;

class GeneratePhrExportJob implements ShouldQueue
{
    use Dispatchable, Queueable;

    public int $timeout = 300;

    public int $tries = 1;

    public function __construct(public int $exportId)
    {
        $this->onQueue('phr-exports');
    }

    public function handle(PhrExportService $exportService): void
    {
        $export = PhrExport::query()->find($this->exportId);
        if (! $export || $export->status !== PhrExport::STATUS_PENDING) {
            return;
        }

        $exportService->generate($export);
    }
}
