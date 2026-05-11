<?php

namespace App\Services\Finance\CapitalGains;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;

class LotMatcherAutoDispatchService
{
    /**
     * Dispatch a matcher refresh for one tax document when it contains 1099-B data.
     */
    public function dispatchForTaxDocument(
        int $taxDocumentId,
        LotMatcherAutoTrigger $trigger,
        ?int $accountId = null,
        ?int $taxYear = null,
    ): int {
        $taxDocument = FileForTaxDocument::query()
            ->with('accountLinks')
            ->find($taxDocumentId);

        if (! $taxDocument instanceof FileForTaxDocument || ! $this->isBroker1099BDocument($taxDocument)) {
            return 0;
        }

        $this->queueDocument(
            taxDocumentId: (int) $taxDocument->id,
            trigger: $trigger,
            accountId: $accountId,
            taxYear: $taxYear ?? (int) $taxDocument->tax_year,
        );

        return 1;
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
        $years = $this->normalizeYears($taxYears);
        if ($years === []) {
            return 0;
        }

        $documents = FileForTaxDocument::query()
            ->with('accountLinks')
            ->where('user_id', $userId)
            ->whereIn('tax_year', $years)
            ->where(function (Builder $query) use ($accountId, $years): void {
                $query->where(function (Builder $directQuery) use ($accountId): void {
                    $directQuery->whereIn('form_type', ['1099_b', 'broker_1099'])
                        ->where('account_id', $accountId);
                })->orWhereHas('accountLinks', function (Builder $linkQuery) use ($accountId, $years): void {
                    $linkQuery->where('account_id', $accountId)
                        ->where('form_type', '1099_b')
                        ->whereIn('tax_year', $years);
                });
            })
            ->orderBy('id')
            ->get();

        $queuedDocumentIds = [];
        foreach ($documents as $document) {
            if (! $this->isBroker1099BDocument($document)) {
                continue;
            }

            $documentId = (int) $document->id;
            if (isset($queuedDocumentIds[$documentId])) {
                continue;
            }

            $this->queueDocument(
                taxDocumentId: $documentId,
                trigger: $trigger,
                accountId: $accountId,
                taxYear: (int) $document->tax_year,
            );
            $queuedDocumentIds[$documentId] = true;
        }

        return count($queuedDocumentIds);
    }

    /**
     * @param  iterable<int|string>  $taxYears
     * @return list<int>
     */
    private function normalizeYears(iterable $taxYears): array
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

    private function isBroker1099BDocument(FileForTaxDocument $taxDocument): bool
    {
        if ((string) $taxDocument->getAttribute('form_type') === '1099_b') {
            return true;
        }

        if (! $taxDocument->relationLoaded('accountLinks')) {
            $taxDocument->load('accountLinks');
        }

        return $taxDocument->accountLinks->contains(
            fn (mixed $link): bool => $link instanceof TaxDocumentAccount
                && (string) $link->getAttribute('form_type') === '1099_b',
        );
    }

    private function queueDocument(
        int $taxDocumentId,
        LotMatcherAutoTrigger $trigger,
        ?int $accountId,
        ?int $taxYear,
    ): void {
        LotsMatchJob::dispatch($taxDocumentId)
            ->delay(now()->addSeconds(LotsMatchJob::DELAY_SECONDS))
            ->afterCommit();

        Log::info('Lot matcher auto-dispatch queued', [
            'tax_document_id' => $taxDocumentId,
            'trigger' => $trigger->value,
            'account_id' => $accountId,
            'tax_year' => $taxYear,
            'delay_seconds' => LotsMatchJob::DELAY_SECONDS,
        ]);
    }
}
