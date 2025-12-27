<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Support\Facades\Gate;

class ClientPortalAgreementController extends Controller
{
    /**
     * Display an agreement to the client.
     */
    public function show($slug, $agreementId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->firstOrFail();

        return view('client-management.portal.agreement', [
            'slug' => $slug,
            'company' => $company,
            'agreement' => $agreement,
        ]);
    }
}
