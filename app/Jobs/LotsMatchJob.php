<?php

namespace App\Jobs;

use App\Exceptions\StaleLotMatchRunException;
use App\Models\FinanceTool\LotMatchRun;
use App\Services\Finance\CapitalGains\LotMatcherResult;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotMatchRunRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class LotsMatchJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public const int DELAY_SECONDS = 30;

    public const int UNIQUE_FOR_SECONDS = 300;

    public int $tries = 3;

    public int $timeout = self::UNIQUE_FOR_SECONDS;

    /**
     * @var list<int>
     */
    public array $backoff = [30, 120];

    public int $uniqueFor = self::UNIQUE_FOR_SECONDS;

    public readonly string $queuedAtIso;

    public function __construct(
        public readonly int $documentId,
        public readonly ?int $taxYear = null,
        ?string $queuedAtIso = null,
        public readonly ?int $runId = null,
        public readonly string $mode = LotMatchRun::MODE_PRESERVE,
    ) {
        $this->queuedAtIso = $queuedAtIso ?? now()->toIso8601String();
    }

    public function handle(LotMatcherService $lotMatcherService, LotMatchRunRecorder $lotMatchRunRecorder): void
    {
        $started = hrtime(true);
        $success = false;
        $run = $this->resolveRun($lotMatchRunRecorder);
        if ($run instanceof LotMatchRun) {
            $run = $this->activateRunOrCoalesced($run, $lotMatchRunRecorder);
            if (! $run instanceof LotMatchRun) {
                $this->logSkippedStaleRun();

                return;
            }
        }

        try {
            if ($run instanceof LotMatchRun) {
                DB::transaction(function () use (&$run, $lotMatcherService, $lotMatchRunRecorder): void {
                    $run = $this->latestActiveRunForUpdate($run, $lotMatchRunRecorder);
                    $result = $lotMatcherService->runMatcherForDocument(
                        $this->documentId,
                        preserveDecisions: $this->mode !== LotMatchRun::MODE_FORCE,
                    );
                    $run = $this->succeedLatestActiveRun($run, $lotMatchRunRecorder, $result);

                });
            } else {
                $lotMatcherService->runMatcherForDocument(
                    $this->documentId,
                    preserveDecisions: $this->mode !== LotMatchRun::MODE_FORCE,
                );
            }
            $success = true;
        } catch (StaleLotMatchRunException) {
            $this->logSkippedStaleRun($run);

            return;
        } catch (\Throwable $exception) {
            if ($run instanceof LotMatchRun && $this->hasExhaustedAttempts()) {
                $lotMatchRunRecorder->failed($run, $exception, $this->taxYear);
            }

            throw $exception;
        } finally {
            Log::info('LotsMatchJob: matcher timing', [
                'document_id' => $this->documentId,
                'tax_year' => $this->taxYear,
                'run_id' => $run instanceof LotMatchRun ? (int) $run->id : null,
                'mode' => $this->mode,
                'queue_wait_ms' => $this->queueWaitMs(),
                'duration_ms' => round((hrtime(true) - $started) / 1_000_000, 2),
                'success' => $success,
            ]);
        }
    }

    public function uniqueId(): string
    {
        return (string) $this->documentId;
    }

    public function failed(\Throwable $exception): void
    {
        if ($this->runId !== null) {
            $run = LotMatchRun::query()->find($this->runId);
            if ($run instanceof LotMatchRun && $run->status !== LotMatchRun::STATUS_FAILED) {
                app(LotMatchRunRecorder::class)->failed($run, $exception, $this->taxYear);
            }
        }

        Log::error('LotsMatchJob: permanent failure while refreshing lot reconciliation links', [
            'document_id' => $this->documentId,
            'tax_year' => $this->taxYear,
            'run_id' => $this->runId,
            'mode' => $this->mode,
            'error' => $exception->getMessage(),
        ]);
    }

    private function resolveRun(LotMatchRunRecorder $lotMatchRunRecorder): ?LotMatchRun
    {
        if ($this->runId !== null) {
            $run = LotMatchRun::query()->find($this->runId);

            return $run instanceof LotMatchRun ? $run : null;
        }

        $userId = $lotMatchRunRecorder->userIdForDocument($this->documentId);
        if ($userId === null) {
            return null;
        }

        return $lotMatchRunRecorder->queued(
            documentId: $this->documentId,
            userId: $userId,
            taxYear: $this->taxYear,
            mode: $this->mode,
        );
    }

    private function queueWaitMs(): int
    {
        $queuedAtMs = ((float) CarbonImmutable::parse($this->queuedAtIso)->format('U.u')) * 1000;

        return max(0, (int) round((microtime(true) * 1000) - $queuedAtMs));
    }

    private function latestActiveRunForUpdate(LotMatchRun $run, LotMatchRunRecorder $lotMatchRunRecorder): LotMatchRun
    {
        $activeRun = $lotMatchRunRecorder->latestActiveForUpdate($run);
        if (! $activeRun instanceof LotMatchRun) {
            throw new StaleLotMatchRunException('Lot match run is no longer the latest active run.');
        }

        return $activeRun;
    }

    private function activateRunOrCoalesced(LotMatchRun $run, LotMatchRunRecorder $lotMatchRunRecorder): ?LotMatchRun
    {
        $activeRun = $lotMatchRunRecorder->runningIfLatestActive($run);
        if ($activeRun instanceof LotMatchRun) {
            return $activeRun;
        }

        if ($this->mode !== LotMatchRun::MODE_PRESERVE) {
            return null;
        }

        $coalescedRun = $lotMatchRunRecorder->latestQueuedPreserveForDocument($this->documentId);
        if (! $coalescedRun instanceof LotMatchRun || (int) $coalescedRun->id === (int) $run->id) {
            return null;
        }

        return $lotMatchRunRecorder->runningIfLatestActive($coalescedRun);
    }

    private function succeedLatestActiveRun(LotMatchRun $run, LotMatchRunRecorder $lotMatchRunRecorder, LotMatcherResult $result): LotMatchRun
    {
        $succeededRun = $lotMatchRunRecorder->succeededIfLatestActive($run, $result, $this->taxYear);
        if (! $succeededRun instanceof LotMatchRun) {
            throw new StaleLotMatchRunException('Lot match run was superseded before success could be recorded.');
        }

        return $succeededRun;
    }

    private function hasExhaustedAttempts(): bool
    {
        return $this->attempts() >= $this->tries;
    }

    private function logSkippedStaleRun(?LotMatchRun $run = null): void
    {
        Log::info('LotsMatchJob: skipped stale lot match run', [
            'document_id' => $this->documentId,
            'tax_year' => $this->taxYear,
            'run_id' => $run instanceof LotMatchRun ? (int) $run->id : $this->runId,
            'mode' => $this->mode,
            'queue_wait_ms' => $this->queueWaitMs(),
        ]);
    }
}
