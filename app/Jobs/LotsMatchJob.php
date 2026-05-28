<?php

namespace App\Jobs;

use App\Services\Finance\CapitalGains\LotMatcherService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
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
    ) {
        $this->queuedAtIso = $queuedAtIso ?? now()->toIso8601String();
    }

    public function handle(LotMatcherService $lotMatcherService): void
    {
        $started = hrtime(true);
        $success = false;

        try {
            $lotMatcherService->runMatcherForDocument($this->documentId, preserveDecisions: true);
            $success = true;
        } finally {
            Log::info('LotsMatchJob: matcher timing', [
                'document_id' => $this->documentId,
                'tax_year' => $this->taxYear,
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
        Log::error('LotsMatchJob: permanent failure while refreshing lot reconciliation links', [
            'document_id' => $this->documentId,
            'tax_year' => $this->taxYear,
            'error' => $exception->getMessage(),
        ]);
    }

    private function queueWaitMs(): int
    {
        $queuedAtMs = ((float) CarbonImmutable::parse($this->queuedAtIso)->format('U.u')) * 1000;

        return max(0, (int) round((microtime(true) * 1000) - $queuedAtMs));
    }
}
