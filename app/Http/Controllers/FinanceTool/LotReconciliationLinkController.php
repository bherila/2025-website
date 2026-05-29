<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RelinkLotReconciliationRequest;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\ReconciliationSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class LotReconciliationLinkController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public function acceptBroker(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);
        $updatedLink = $this->lotMatcherService->acceptBrokerLink((int) $link->id, (int) Auth::id());
        $this->forgetSummaryCacheForLink($updatedLink);

        return response()->json($this->linkPayload($updatedLink));
    }

    public function acceptAccountOverride(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);
        $updatedLink = $this->lotMatcherService->acceptAccountOverride((int) $link->id, (int) Auth::id());
        $this->forgetSummaryCacheForLink($updatedLink);

        return response()->json($this->linkPayload($updatedLink));
    }

    public function markDuplicate(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);
        $updatedLink = $this->lotMatcherService->markDuplicate((int) $link->id, (int) Auth::id());
        $this->forgetSummaryCacheForLink($updatedLink);

        return response()->json($this->linkPayload($updatedLink));
    }

    public function unlink(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);
        $updatedLink = $this->lotMatcherService->unlinkLot((int) $link->id, (int) Auth::id());
        $this->forgetSummaryCacheForLink($updatedLink);

        return response()->json($this->linkPayload($updatedLink));
    }

    public function relink(RelinkLotReconciliationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $brokerLot = $this->ownedBrokerLot((int) $validated['broker_lot_id']);
        $accountLot = $this->ownedAccountLot((int) $validated['account_lot_id']);
        $updatedLink = $this->lotMatcherService->relinkLot((int) $brokerLot->lot_id, (int) $accountLot->lot_id, (int) Auth::id());
        $this->forgetSummaryCacheForLink($updatedLink);

        return response()->json($this->linkPayload($updatedLink));
    }

    private function ownedLink(int $id): FinLotReconciliationLink
    {
        return FinLotReconciliationLink::query()
            ->whereKey($id)
            ->where(function ($query): void {
                $query->whereHas('document', fn ($documentQuery) => $documentQuery->where('user_id', (int) Auth::id()))
                    ->orWhereHas('brokerLot.account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()))
                    ->orWhereHas('accountLot.account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()));
            })
            ->firstOrFail();
    }

    private function ownedBrokerLot(int $id): FinAccountLot
    {
        return FinAccountLot::query()
            ->whereKey($id)
            ->whereNotNull('document_id')
            ->where(function ($query): void {
                $query->whereIn('lot_origin', [
                    FinAccountLot::ORIGIN_1099B_DISPOSITION,
                    FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                ])->orWhereIn('source', [
                    FinAccountLot::SOURCE_BROKER_1099B,
                    FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                ])->orWhereIn('lot_source', [
                    FinAccountLot::SOURCE_1099B,
                    FinAccountLot::SOURCE_1099B_UNDERSCORE,
                    'import_1099b',
                ]);
            })
            ->whereHas('document', fn ($documentQuery) => $documentQuery->where('user_id', (int) Auth::id()))
            ->firstOrFail();
    }

    private function ownedAccountLot(int $id): FinAccountLot
    {
        return FinAccountLot::query()
            ->whereKey($id)
            ->where(function ($query): void {
                $query->whereNull('document_id')
                    ->orWhereNotIn('lot_origin', [
                        FinAccountLot::ORIGIN_1099B_DISPOSITION,
                        FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
                        FinAccountLot::ORIGIN_STATEMENT_POSITION,
                    ]);
            })
            ->where(function ($query): void {
                $query->whereNull('source')
                    ->orWhereNotIn('source', [
                        FinAccountLot::SOURCE_BROKER_1099B,
                        FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                    ]);
            })
            ->where(function ($query): void {
                $query->whereNull('lot_source')
                    ->orWhereNotIn('lot_source', [
                        FinAccountLot::SOURCE_1099B,
                        FinAccountLot::SOURCE_1099B_UNDERSCORE,
                        'import_1099b',
                    ]);
            })
            ->whereHas('account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()))
            ->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    private function linkPayload(FinLotReconciliationLink $link): array
    {
        $taxDocument = $link->relationLoaded('taxDocument') ? $link->getRelation('taxDocument') : $link->taxDocument;

        return [
            'id' => (int) $link->id,
            'documentId' => $link->document_id !== null ? (int) $link->document_id : null,
            'taxDocumentId' => $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : null,
            'brokerLotId' => $link->broker_lot_id !== null ? (int) $link->broker_lot_id : null,
            'accountLotId' => $link->account_lot_id !== null ? (int) $link->account_lot_id : null,
            'state' => $link->state,
            'matchReason' => $link->match_reason,
            'acceptedByUserId' => $link->accepted_by_user_id !== null ? (int) $link->accepted_by_user_id : null,
            'acceptedAt' => $link->accepted_at,
        ];
    }

    private function forgetSummaryCacheForLink(FinLotReconciliationLink $link): void
    {
        $taxDocument = $link->relationLoaded('taxDocument') ? $link->getRelation('taxDocument') : $link->taxDocument;

        if (! $taxDocument instanceof FileForTaxDocument) {
            return;
        }

        Cache::forget(ReconciliationSummaryService::cacheKey((int) $taxDocument->user_id, (int) $taxDocument->tax_year));
    }
}
