<?php

namespace App\Jobs;

use App\Models\FinanceTool\LotMatchRun;
use App\Services\Finance\CapitalGains\LotMatchRunRecorder;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class DispatchQueuedLotsMatchRunJob implements ShouldQueue
{
    use Queueable;

    public const int RELEASE_AFTER_SECONDS = 5;

    public const int MAX_ATTEMPTS = 120;

    public int $tries = self::MAX_ATTEMPTS;

    public int $timeout = 30;

    /**
     * @var list<int>
     */
    public array $backoff = [5, 10, 20, 30];

    public function __construct(
        public readonly int $documentId,
        public readonly ?int $taxYear = null,
    ) {}

    public function handle(
        LotMatchRunRecorder $lotMatchRunRecorder,
        CacheRepository $cache,
        Dispatcher $dispatcher,
    ): void {
        $run = $lotMatchRunRecorder->latestQueuedPreserveForDocument($this->documentId);
        if (! $run instanceof LotMatchRun) {
            return;
        }

        $lockJob = new LotsMatchJob($this->documentId, $this->taxYear);
        $uniqueLock = new UniqueLock($cache);
        if (! $uniqueLock->acquire($lockJob)) {
            $this->release(self::RELEASE_AFTER_SECONDS);

            Log::info('DispatchQueuedLotsMatchRunJob: matcher lock still held; retrying queued run dispatch', [
                'document_id' => $this->documentId,
                'tax_year' => $this->taxYear,
                'run_id' => (int) $run->id,
                'release_after_seconds' => self::RELEASE_AFTER_SECONDS,
            ]);

            return;
        }

        try {
            $job = (new LotsMatchJob($this->documentId, $this->taxYear, null, (int) $run->id, LotMatchRun::MODE_PRESERVE))
                ->afterCommit();

            $dispatcher->dispatch($job);
        } catch (\Throwable $exception) {
            $uniqueLock->release($lockJob);
            $lotMatchRunRecorder->failed($run, $exception, $this->taxYear);

            throw $exception;
        }

        Log::info('DispatchQueuedLotsMatchRunJob: dispatched queued lot match run', [
            'document_id' => $this->documentId,
            'tax_year' => $this->taxYear,
            'run_id' => (int) $run->id,
        ]);
    }
}
