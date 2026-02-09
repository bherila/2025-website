<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientAgreementController extends Controller
{
    /**
     * Display the agreement edit page for admin.
     */
    public function show($id)
    {
        Gate::authorize('Admin');

        $agreement = ClientAgreement::with('clientCompany')->findOrFail($id);

        return view('client-management.agreement.show', [
            'agreement' => $agreement,
            'company' => $agreement->clientCompany,
        ]);
    }

    /**
     * Create a new agreement for a client company.
     */
    public function store(Request $request)
    {
        Gate::authorize('Admin');

        $validated = $request->validate([
            'client_company_id' => 'required|exists:client_companies,id',
        ]);

        $company = ClientCompany::findOrFail($validated['client_company_id']);

        $agreement = ClientAgreement::create([
            'client_company_id' => $company->id,
            'active_date' => now(),
            'monthly_retainer_hours' => 10,
            'catch_up_threshold_hours' => 1.0,
            'rollover_months' => 1,
            'hourly_rate' => $company->default_hourly_rate ?? 0,
            'monthly_retainer_fee' => 0,
            'is_visible_to_client' => false,
        ]);

        return redirect("/client/mgmt/agreement/{$agreement->id}");
    }
}
