<?php

namespace App\Http\Controllers\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\PreviewAgreementTransitionRequest;
use App\Http\Requests\ClientManagement\StoreAgreementTransitionRequest;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Services\ClientManagement\AgreementTransitionService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ClientAgreementApiController extends Controller
{
    /**
     * Get all agreements for a client company.
     */
    public function index(int $companyId): Collection
    {
        Gate::authorize('Admin');

        $company = ClientCompany::findOrFail($companyId);

        return $company->agreements()->orderBy('active_date', 'desc')->get();
    }

    /**
     * Get a single agreement.
     */
    public function show(int $id): ClientAgreement
    {
        Gate::authorize('Admin');

        return ClientAgreement::with('clientCompany', 'signedByUser', 'recurringItems')->findOrFail($id);
    }

    /**
     * Update an agreement (admin only, before signing).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::with('clientCompany')->findOrFail($id);

        // Only allow editing if not signed
        if ($agreement->isSigned()) {
            return response()->json([
                'error' => 'Cannot edit a signed agreement. You can only terminate it.',
            ], 422);
        }

        $validated = $request->validate([
            'active_date' => 'nullable|date',
            'agreement_text' => 'nullable|string',
            'agreement_link' => 'nullable|string|max:4096',
            'monthly_retainer_hours' => 'nullable|numeric|min:0',
            'catch_up_threshold_hours' => [
                'nullable',
                'numeric',
                'min:0',
                function ($attribute, $value, $fail) use ($request, $agreement) {
                    $retainerHours = $request->has('monthly_retainer_hours')
                        ? $request->input('monthly_retainer_hours')
                        : $agreement->monthly_retainer_hours;

                    if ($value > $retainerHours) {
                        $fail("The catch-up threshold hours cannot exceed monthly retainer hours ({$retainerHours}).");
                    }
                },
            ],
            'rollover_months' => 'nullable|integer|min:0',
            'hourly_rate' => 'nullable|numeric|min:0',
            'monthly_retainer_fee' => 'nullable|numeric|min:0',
            'retainer_fee' => 'nullable|numeric|min:0',
            'retainer_hours' => 'nullable|numeric|min:0',
            'is_visible_to_client' => 'nullable|boolean',
            'billing_cadence' => ['nullable', Rule::enum(BillingCadence::class)],
            'bill_overage_interim' => 'nullable|boolean',
            'first_cycle_proration' => ['nullable', Rule::enum(FirstCycleProration::class)],
        ]);
        $cadence = BillingCadence::tryFrom((string) ($validated['billing_cadence'] ?? $agreement->effectiveBillingCadence()->value));
        if ($cadence === BillingCadence::Monthly && (($validated['retainer_fee'] ?? null) !== null || ($validated['retainer_hours'] ?? null) !== null)) {
            return response()->json([
                'error' => 'Monthly agreements cannot set retainer_fee or retainer_hours.',
            ], 422);
        }

        // Clear stale period retainer overrides when transitioning to monthly
        if ($cadence === BillingCadence::Monthly) {
            $validated['retainer_fee'] = null;
            $validated['retainer_hours'] = null;
        }

        $agreement->update($validated);

        return response()->json([
            'success' => true,
            'agreement' => $agreement->fresh(),
        ]);
    }

    /**
     * Terminate an agreement (admin only).
     */
    public function terminate(Request $request, int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::with('clientCompany')->findOrFail($id);

        $validated = $request->validate([
            'termination_date' => 'nullable|date',
        ]);

        $terminationDate = $validated['termination_date'] ?? now();
        $agreement->terminate(new \DateTime($terminationDate));

        return response()->json([
            'success' => true,
            'agreement' => $agreement->fresh(),
        ]);
    }

    /**
     * Preview an agreement transition without writing changes.
     */
    public function transitionPreview(
        ClientCompany $company,
        ClientAgreement $agreement,
        PreviewAgreementTransitionRequest $request,
        AgreementTransitionService $transitionService,
    ): JsonResponse {
        Gate::authorize('Admin');

        if ((int) $agreement->client_company_id !== (int) $company->id) {
            return response()->json(['error' => 'Agreement does not belong to this company'], 404);
        }

        try {
            return response()->json([
                'preview' => $transitionService->preview($company, $agreement, $request->payload()),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Terminate the outgoing agreement and create its successor.
     */
    public function transition(
        ClientCompany $company,
        ClientAgreement $agreement,
        StoreAgreementTransitionRequest $request,
        AgreementTransitionService $transitionService,
    ): JsonResponse {
        Gate::authorize('Admin');

        if ((int) $agreement->client_company_id !== (int) $company->id) {
            return response()->json(['error' => 'Agreement does not belong to this company'], 404);
        }

        try {
            $result = $transitionService->transition($company, $agreement, $request->payload());

            return response()->json([
                'message' => 'Agreement transitioned successfully',
                'outgoing_agreement' => $result['outgoing_agreement'],
                'successor_agreement' => $result['successor_agreement'],
                'preview' => $result['preview'],
            ], 201);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Delete an agreement (admin only, only if not signed).
     */
    public function destroy(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::with('clientCompany')->findOrFail($id);
        $companyId = $agreement->client_company_id;
        $slug = $agreement->clientCompany ? $agreement->clientCompany->slug : null;

        if ($agreement->isSigned()) {
            return response()->json([
                'error' => 'Cannot delete a signed agreement.',
            ], 422);
        }

        $agreement->delete();

        return response()->json([
            'success' => true,
        ]);
    }
}
