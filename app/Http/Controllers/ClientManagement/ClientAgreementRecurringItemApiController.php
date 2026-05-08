<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\StoreClientAgreementRecurringItemRequest;
use App\Http\Requests\ClientManagement\UpdateClientAgreementRecurringItemRequest;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class ClientAgreementRecurringItemApiController extends Controller
{
    public function index(ClientCompany $company, ClientAgreement $agreement): JsonResponse
    {
        Gate::authorize('Admin');

        if (! $this->agreementBelongsToCompany($agreement, $company)) {
            return response()->json(['error' => 'Agreement does not belong to this company'], 404);
        }

        $items = $agreement->recurringItems()
            ->orderBy('start_date')
            ->orderBy('id')
            ->get()
            ->map(fn (ClientAgreementRecurringItem $item): array => $this->serialize($item))
            ->values();

        return response()->json(['recurring_items' => $items]);
    }

    public function store(
        StoreClientAgreementRecurringItemRequest $request,
        ClientCompany $company,
        ClientAgreement $agreement,
    ): JsonResponse {
        Gate::authorize('Admin');

        if (! $this->agreementBelongsToCompany($agreement, $company)) {
            return response()->json(['error' => 'Agreement does not belong to this company'], 404);
        }

        $item = $agreement->recurringItems()->create($request->validated());

        return response()->json([
            'message' => 'Recurring item created successfully',
            'recurring_item' => $this->serialize($item->fresh()),
        ], 201);
    }

    public function update(
        UpdateClientAgreementRecurringItemRequest $request,
        ClientCompany $company,
        ClientAgreement $agreement,
        ClientAgreementRecurringItem $recurringItem,
    ): JsonResponse {
        Gate::authorize('Admin');

        if (! $this->agreementBelongsToCompany($agreement, $company)
            || ! $this->itemBelongsToAgreement($recurringItem, $agreement)) {
            return response()->json(['error' => 'Recurring item does not belong to this agreement'], 404);
        }

        $recurringItem->update($request->validated());

        return response()->json([
            'message' => 'Recurring item updated successfully',
            'recurring_item' => $this->serialize($recurringItem->fresh()),
        ]);
    }

    public function destroy(
        ClientCompany $company,
        ClientAgreement $agreement,
        ClientAgreementRecurringItem $recurringItem,
    ): JsonResponse {
        Gate::authorize('Admin');

        if (! $this->agreementBelongsToCompany($agreement, $company)
            || ! $this->itemBelongsToAgreement($recurringItem, $agreement)) {
            return response()->json(['error' => 'Recurring item does not belong to this agreement'], 404);
        }

        $recurringItem->delete();

        return response()->json(['message' => 'Recurring item deleted successfully']);
    }

    private function agreementBelongsToCompany(ClientAgreement $agreement, ClientCompany $company): bool
    {
        return (int) $agreement->client_company_id === (int) $company->id;
    }

    private function itemBelongsToAgreement(ClientAgreementRecurringItem $item, ClientAgreement $agreement): bool
    {
        return (int) $item->client_agreement_id === (int) $agreement->id;
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(ClientAgreementRecurringItem $item): array
    {
        return [
            'id' => $item->id,
            'client_agreement_id' => $item->client_agreement_id,
            'description' => $item->description,
            'amount' => (float) $item->amount,
            'charge_cadence' => $item->charge_cadence->value,
            'anchor_month' => $item->anchor_month,
            'anchor_day' => $item->anchor_day,
            'start_date' => $item->start_date->toDateString(),
            'end_date' => $item->end_date?->toDateString(),
            'is_taxable' => (bool) $item->is_taxable,
            'is_summarized' => (bool) $item->is_summarized,
            'notes' => $item->notes,
        ];
    }
}
