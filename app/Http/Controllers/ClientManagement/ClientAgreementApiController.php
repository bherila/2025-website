<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientAgreementApiController extends Controller
{
    /**
     * Get all agreements for a client company.
     */
    public function index($companyId)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::findOrFail($companyId);
        $agreements = $company->agreements()->orderBy('active_date', 'desc')->get();

        return response()->json($agreements);
    }

    /**
     * Get a single agreement.
     */
    public function show($id)
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::with('clientCompany', 'signedByUser')->findOrFail($id);

        return response()->json($agreement);
    }

    /**
     * Update an agreement (admin only, before signing).
     */
    public function update(Request $request, $id)
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::findOrFail($id);

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
            'rollover_months' => 'nullable|integer|min:0',
            'hourly_rate' => 'nullable|numeric|min:0',
            'monthly_retainer_fee' => 'nullable|numeric|min:0',
            'is_visible_to_client' => 'nullable|boolean',
        ]);

        $agreement->update($validated);

        return response()->json([
            'success' => true,
            'agreement' => $agreement->fresh(),
        ]);
    }

    /**
     * Terminate an agreement (admin only).
     */
    public function terminate(Request $request, $id)
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::findOrFail($id);

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
     * Delete an agreement (admin only, only if not signed).
     */
    public function destroy($id)
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::findOrFail($id);

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
