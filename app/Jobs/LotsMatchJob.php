<?php

namespace App\Jobs;

use App\Services\Finance\CapitalGains\LotMatcherService;
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

    public function __construct(
        public readonly int $taxDocumentId,
        public readonly ?int $taxYear = null,
    ) {}

    public function handle(LotMatcherService $lotMatcherService): void
    {
        $lotMatcherService->runMatcherForDocument($this->taxDocumentId, preserveDecisions: true);
    }

    public function uniqueId(): string
    {
        return (string) $this->taxDocumentId;
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('LotsMatchJob: permanent failure while refreshing lot reconciliation links', [
            'tax_document_id' => $this->taxDocumentId,
            'tax_year' => $this->taxYear,
            'error' => $exception->getMessage(),
        ]);
    }
}
