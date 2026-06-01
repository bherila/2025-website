<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class ClientPortalProposalController extends Controller
{
    /**
     * List the client-visible proposals for a company.
     */
    public function index(string $slug): View
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $proposals = $company->proposals()
            ->where('is_visible_to_client', true)
            ->orderByDesc('root_id')
            ->orderByDesc('version')
            ->get();

        return view('client-management.portal.proposals', [
            'slug' => $slug,
            'company' => $company,
            'proposals' => $proposals,
        ]);
    }

    /**
     * Display a single proposal to the client.
     */
    public function show(string $slug, int $proposalId): View
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $proposal = ClientProposal::where('id', $proposalId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->with(['items', 'agreement', 'project', 'versions'])
            ->firstOrFail();

        return view('client-management.portal.proposal', [
            'slug' => $slug,
            'company' => $company,
            'proposal' => $proposal,
        ]);
    }
}
