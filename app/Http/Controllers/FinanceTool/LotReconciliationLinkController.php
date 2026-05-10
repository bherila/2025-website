<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\RelinkLotReconciliationRequest;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class LotReconciliationLinkController extends Controller
{
    public function __construct(
        private readonly LotMatcherService $lotMatcherService,
    ) {}

    public function acceptBroker(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);

        return response()->json($this->linkPayload(
            $this->lotMatcherService->acceptBrokerLink((int) $link->id, (int) Auth::id()),
        ));
    }

    public function acceptAccountOverride(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);

        return response()->json($this->linkPayload(
            $this->lotMatcherService->acceptAccountOverride((int) $link->id, (int) Auth::id()),
        ));
    }

    public function markDuplicate(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);

        return response()->json($this->linkPayload(
            $this->lotMatcherService->markDuplicate((int) $link->id, (int) Auth::id()),
        ));
    }

    public function unlink(int $id): JsonResponse
    {
        $link = $this->ownedLink($id);

        return response()->json($this->linkPayload(
            $this->lotMatcherService->unlinkLot((int) $link->id, (int) Auth::id()),
        ));
    }

    public function relink(RelinkLotReconciliationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $brokerLot = $this->ownedBrokerLot((int) $validated['broker_lot_id']);
        $accountLot = $this->ownedAccountLot((int) $validated['account_lot_id']);

        return response()->json($this->linkPayload(
            $this->lotMatcherService->relinkLot((int) $brokerLot->lot_id, (int) $accountLot->lot_id, (int) Auth::id()),
        ));
    }

    private function ownedLink(int $id): FinLotReconciliationLink
    {
        return FinLotReconciliationLink::query()
            ->whereKey($id)
            ->where(function ($query): void {
                $query->whereHas('taxDocument', fn ($documentQuery) => $documentQuery->where('user_id', (int) Auth::id()))
                    ->orWhereHas('brokerLot.account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()))
                    ->orWhereHas('accountLot.account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()));
            })
            ->firstOrFail();
    }

    private function ownedBrokerLot(int $id): FinAccountLot
    {
        return FinAccountLot::query()
            ->whereKey($id)
            ->whereNotNull('tax_document_id')
            ->whereHas('taxDocument', fn ($documentQuery) => $documentQuery->where('user_id', (int) Auth::id()))
            ->firstOrFail();
    }

    private function ownedAccountLot(int $id): FinAccountLot
    {
        return FinAccountLot::query()
            ->whereKey($id)
            ->whereHas('account', fn ($accountQuery) => $accountQuery->withoutGlobalScopes()->where('acct_owner', (int) Auth::id()))
            ->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    private function linkPayload(FinLotReconciliationLink $link): array
    {
        return [
            'id' => (int) $link->id,
            'taxDocumentId' => $link->tax_document_id !== null ? (int) $link->tax_document_id : null,
            'brokerLotId' => $link->broker_lot_id !== null ? (int) $link->broker_lot_id : null,
            'accountLotId' => $link->account_lot_id !== null ? (int) $link->account_lot_id : null,
            'state' => $link->state,
            'matchReason' => $link->match_reason,
            'acceptedByUserId' => $link->accepted_by_user_id !== null ? (int) $link->accepted_by_user_id : null,
            'acceptedAt' => $link->accepted_at,
        ];
    }
}
