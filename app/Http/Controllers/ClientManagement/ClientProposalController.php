<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Services\ClientManagement\ProposalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class ClientProposalController extends Controller
{
    /**
     * Display the proposal builder page for admin.
     */
    public function show(int $id): View
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::with(['clientCompany', 'items'])->findOrFail($id);

        return view('client-management.proposal.show', [
            'proposal' => $proposal,
            'company' => $proposal->clientCompany,
        ]);
    }

    /**
     * Create a blank draft proposal and redirect to the builder.
     */
    public function store(Request $request, ProposalService $proposals): RedirectResponse
    {
        Gate::authorize('Admin');

        $validated = $request->validate([
            'client_company_id' => 'required|exists:client_companies,id',
        ]);

        $company = ClientCompany::findOrFail($validated['client_company_id']);
        $proposal = $proposals->createBlank($company);

        return redirect("/client/mgmt/proposal/{$proposal->id}");
    }
}
