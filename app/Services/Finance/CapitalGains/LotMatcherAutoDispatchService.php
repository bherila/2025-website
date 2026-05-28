<?php

namespace App\Services\Finance\CapitalGains;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\LotMatchRun;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;

class LotMatcherAutoDispatchService
{
    public function __construct(
        private readonly LotMatchRunRecorder $lotMatchRunRecorder,
    ) {}

    /**
     * Dispatch a matcher refresh for one unified document when it contains broker-reported disposition data.
     */
    public function dispatchForDocument(
        int $documentId,
        LotMatcherAutoTrigger $trigger,
        ?int $accountId = null,
        ?int $taxYear = null,
    ): int {
        $document = FinDocument::query()
            ->with(['taxDocument.accountLinks', 'accounts'])
            ->find($documentId);

        if (! $document instanceof FinDocument || ! $this->isBrokerDocument($document)) {
            return 0;
        }

        return $this->queueDocument(
            documentId: (int) $document->id,
            userId: (int) $document->user_id,
            trigger: $trigger,
            accountId: $accountId,
            taxYear: $taxYear ?? (int) $document->tax_year,
        ) ? 1 : 0;
    }

    /**
     * Dispatch matcher refreshes for broker documents affected by account-lot changes.
     *
     * @param  iterable<int|string>  $taxYears
     */
    public function dispatchForAccountYears(
        int $userId,
        int $accountId,
        iterable $taxYears,
        LotMatcherAutoTrigger $trigger,
    ): int {
        $years = self::normalizeYears($taxYears);
        if ($years === []) {
            return 0;
        }

        $candidateYears = $this->candidateDocumentYears($years);

        $documents = FinDocument::query()
            ->with(['taxDocument.accountLinks', 'accounts'])
            ->where('user_id', $userId)
            ->where(function (Builder $query) use ($accountId, $candidateYears): void {
                $query->where(function (Builder $taxFormQuery) use ($accountId, $candidateYears): void {
                    $taxFormQuery->whereIn('tax_year', $candidateYears)
                        ->where(function (Builder $linkableQuery) use ($accountId, $candidateYears): void {
                            $linkableQuery->whereHas('taxDocument', function (Builder $taxDocumentQuery) use ($accountId): void {
                                $taxDocumentQuery->whereIn('form_type', [FileForTaxDocument::FORM_TYPE_1099_B, 'broker_1099'])
                                    ->where('account_id', $accountId);
                            })->orWhereHas('accounts', function (Builder $linkQuery) use ($accountId, $candidateYears): void {
                                $linkQuery->where('account_id', $accountId)
                                    ->where('form_type', FileForTaxDocument::FORM_TYPE_1099_B)
                                    ->whereIn('tax_year', $candidateYears);
                            });
                        });
                })->orWhereHas('lots', function (Builder $lotQuery) use ($accountId, $candidateYears): void {
                    $lotQuery->where('acct_id', $accountId)
                        ->where('lot_origin', FinAccountLot::ORIGIN_STATEMENT_DISPOSITION)
                        ->where(function (Builder $dateQuery) use ($candidateYears): void {
                            foreach ($candidateYears as $year) {
                                $dateQuery->orWhereBetween('sale_date', ["{$year}-01-01", "{$year}-12-31"]);
                            }
                        });
                });
            })
            ->orderBy('id')
            ->get();

        $queuedDocumentIds = [];
        foreach ($documents as $document) {
            if (! $this->isBrokerDocument($document)) {
                continue;
            }

            $documentId = (int) $document->id;
            if (isset($queuedDocumentIds[$documentId])) {
                continue;
            }

            $queued = $this->queueDocument(
                documentId: $documentId,
                userId: (int) $document->user_id,
                trigger: $trigger,
                accountId: $accountId,
                taxYear: $document->tax_year === null ? $years[0] : (int) $document->tax_year,
            );
            if ($queued) {
                $queuedDocumentIds[$documentId] = true;
            }
        }

        return count($queuedDocumentIds);
    }

    /**
     * @param  iterable<int|string>  $taxYears
     * @return list<int>
     */
    private static function normalizeYears(iterable $taxYears): array
    {
        $years = [];
        foreach ($taxYears as $taxYear) {
            if (! is_numeric($taxYear)) {
                continue;
            }

            $year = (int) $taxYear;
            if ($year >= 1900 && $year <= 2100) {
                $years[$year] = true;
            }
        }

        return array_keys($years);
    }

    /**
     * @param  iterable<mixed>  $dates
     * @return list<int>
     */
    public static function yearsFromDates(iterable $dates): array
    {
        $years = [];
        foreach ($dates as $date) {
            $year = self::yearFromDate($date);
            if ($year !== null) {
                $years[$year] = true;
            }
        }

        return array_keys($years);
    }

    /**
     * @param  list<int>  $years
     * @return list<int>
     */
    private function candidateDocumentYears(array $years): array
    {
        $candidateYears = [];
        foreach ($years as $year) {
            $candidateYears[] = $year - 1;
            $candidateYears[] = $year;
            $candidateYears[] = $year + 1;
        }

        return self::normalizeYears($candidateYears);
    }

    private static function yearFromDate(mixed $date): ?int
    {
        if ($date instanceof \DateTimeInterface) {
            return (int) $date->format('Y');
        }

        if (! is_string($date) || trim($date) === '') {
            return null;
        }

        $year = (int) substr(trim($date), 0, 4);

        return $year >= 1900 && $year <= 2100 ? $year : null;
    }

    private function isBrokerDocument(FinDocument $document): bool
    {
        if ($document->document_kind === FinDocument::KIND_STATEMENT) {
            return FinAccountLot::query()
                ->where('document_id', $document->id)
                ->where('lot_origin', FinAccountLot::ORIGIN_STATEMENT_DISPOSITION)
                ->exists();
        }

        if ($document->document_kind !== FinDocument::KIND_TAX_FORM) {
            return false;
        }

        $taxDocument = $document->taxDocument;
        if (! $taxDocument instanceof FileForTaxDocument) {
            return false;
        }

        if ((string) $taxDocument->getAttribute('form_type') === FileForTaxDocument::FORM_TYPE_1099_B) {
            return true;
        }

        if (! $taxDocument->relationLoaded('accountLinks')) {
            $taxDocument->load('accountLinks');
        }

        return $taxDocument->accountLinks->contains(
            fn (mixed $link): bool => $link instanceof TaxDocumentAccount
                && (string) $link->getAttribute('form_type') === FileForTaxDocument::FORM_TYPE_1099_B,
        );
    }

    private function queueDocument(
        int $documentId,
        int $userId,
        LotMatcherAutoTrigger $trigger,
        ?int $accountId,
        ?int $taxYear,
    ): bool {
        $lockJob = new LotsMatchJob($documentId, $taxYear);
        $uniqueLock = new UniqueLock(app(CacheRepository::class));
        if (! $uniqueLock->acquire($lockJob)) {
            Log::info('Lot matcher auto-dispatch skipped; job already queued', [
                'document_id' => $documentId,
                'trigger' => $trigger->value,
                'account_id' => $accountId,
                'tax_year' => $taxYear,
            ]);

            return false;
        }

        $run = null;

        try {
            $run = $this->lotMatchRunRecorder->queued($documentId, $userId, $taxYear);
            $job = (new LotsMatchJob($documentId, $taxYear, null, (int) $run->id))
                ->delay(now()->addSeconds(LotsMatchJob::DELAY_SECONDS))
                ->afterCommit();

            app(Dispatcher::class)->dispatch($job);
        } catch (\Throwable $exception) {
            $uniqueLock->release($lockJob);
            if ($run instanceof LotMatchRun) {
                $this->lotMatchRunRecorder->failed($run, $exception, $taxYear);
            }

            throw $exception;
        }

        Log::info('Lot matcher auto-dispatch queued', [
            'document_id' => $documentId,
            'run_id' => (int) $run->id,
            'trigger' => $trigger->value,
            'account_id' => $accountId,
            'tax_year' => $taxYear,
            'delay_seconds' => LotsMatchJob::DELAY_SECONDS,
        ]);

        return true;
    }
}
