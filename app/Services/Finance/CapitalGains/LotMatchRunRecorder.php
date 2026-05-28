<?php

namespace App\Services\Finance\CapitalGains;

use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\LotMatchRun;
use Illuminate\Support\Facades\Cache;

class LotMatchRunRecorder
{
    public function queued(int $documentId, int $userId, ?int $taxYear, string $mode = LotMatchRun::MODE_PRESERVE): LotMatchRun
    {
        $run = LotMatchRun::create([
            'document_id' => $documentId,
            'user_id' => $userId,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => $mode,
        ]);

        $this->supersedeActiveRuns($documentId, (int) $run->id);
        $this->invalidateSummaryCache($userId, $taxYear);

        return $run;
    }

    public function running(LotMatchRun $run): LotMatchRun
    {
        $this->supersedeActiveRuns((int) $run->document_id, (int) $run->id);
        $run->forceFill([
            'status' => LotMatchRun::STATUS_RUNNING,
            'started_at' => $run->started_at ?? now(),
            'finished_at' => null,
            'error' => null,
        ])->save();

        return $run;
    }

    public function succeeded(LotMatchRun $run, LotMatcherResult $result, ?int $taxYear = null): LotMatchRun
    {
        $run->forceFill([
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'finished_at' => now(),
            'result_summary' => $this->resultSummary($result),
            'error' => null,
        ])->save();

        $this->invalidateSummaryCache((int) $run->user_id, $taxYear);

        return $run;
    }

    public function failed(LotMatchRun $run, \Throwable $exception, ?int $taxYear = null): LotMatchRun
    {
        $run->forceFill([
            'status' => LotMatchRun::STATUS_FAILED,
            'finished_at' => now(),
            'error' => $exception->getMessage(),
        ])->save();

        $this->invalidateSummaryCache((int) $run->user_id, $taxYear);

        return $run;
    }

    public function latestForDocument(int $documentId, int $userId): ?LotMatchRun
    {
        /** @var LotMatchRun|null $run */
        $run = LotMatchRun::query()
            ->where('document_id', $documentId)
            ->where('user_id', $userId)
            ->latest('id')
            ->first();

        return $run;
    }

    public function userIdForDocument(int $documentId): ?int
    {
        $document = FinDocument::query()->find($documentId);

        return $document instanceof FinDocument ? (int) $document->user_id : null;
    }

    public function invalidateSummaryCache(int $userId, ?int $taxYear): void
    {
        if ($taxYear === null) {
            return;
        }

        Cache::forget(ReconciliationSummaryService::cacheKey($userId, $taxYear));
    }

    private function supersedeActiveRuns(int $documentId, int $currentRunId): void
    {
        LotMatchRun::query()
            ->where('document_id', $documentId)
            ->where('id', '!=', $currentRunId)
            ->whereIn('status', [LotMatchRun::STATUS_QUEUED, LotMatchRun::STATUS_RUNNING])
            ->update([
                'status' => LotMatchRun::STATUS_SUPERSEDED,
                'finished_at' => now(),
                'updated_at' => now(),
            ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function resultSummary(LotMatcherResult $result): array
    {
        return [
            'documentId' => $result->documentId,
            'dryRun' => $result->dryRun,
            'counts' => $result->counts,
            'linkIdsCount' => count($result->linkIds),
            'proposalCount' => count($result->proposals),
        ];
    }
}
