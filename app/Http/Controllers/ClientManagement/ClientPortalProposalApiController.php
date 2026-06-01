<?php

namespace App\Http\Controllers\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\AcceptProposalRequest;
use App\Http\Requests\ClientManagement\RejectProposalRequest;
use App\Http\Requests\ClientManagement\RequestChangesProposalRequest;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Services\ClientManagement\ProposalService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class ClientPortalProposalApiController extends Controller
{
    public function __construct(private ProposalService $proposals) {}

    /**
     * List the client-visible proposals for a company.
     *
     * @return Collection<int, ClientProposal>
     */
    public function index(string $slug): Collection
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return $company->proposals()
            ->where('is_visible_to_client', true)
            ->with('items')
            ->orderByDesc('root_id')
            ->orderByDesc('version')
            ->get();
    }

    public function show(string $slug, int $proposalId): ClientProposal
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return ClientProposal::where('id', $proposalId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->with(['items', 'agreement', 'project'])
            ->firstOrFail();
    }

    public function accept(AcceptProposalRequest $request, string $slug, int $proposalId): JsonResponse
    {
        $proposal = $this->resolveProposal($slug, $proposalId);
        $validated = $request->validated();

        try {
            $result = $this->proposals->accept(
                $proposal,
                auth()->user(),
                $validated['selected_item_ids'] ?? [],
                $validated['name'],
                $validated['title'],
            );
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json([
            'success' => true,
            'proposal' => $proposal->fresh(['items', 'agreement', 'project']),
            'agreement_id' => $result['agreement']->id,
            'invoice_id' => $result['invoice']->client_invoice_id,
        ]);
    }

    public function reject(RejectProposalRequest $request, string $slug, int $proposalId): JsonResponse
    {
        $proposal = $this->resolveProposal($slug, $proposalId);

        try {
            $proposal = $this->proposals->reject($proposal, auth()->user(), $request->validated()['reason']);
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json(['success' => true, 'proposal' => $proposal->load('items')]);
    }

    public function requestChanges(RequestChangesProposalRequest $request, string $slug, int $proposalId): JsonResponse
    {
        $proposal = $this->resolveProposal($slug, $proposalId);

        try {
            $proposal = $this->proposals->requestChanges($proposal, auth()->user(), $request->validated()['message']);
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json(['success' => true, 'proposal' => $proposal->load('items')]);
    }

    /**
     * Resolve a client-visible proposal scoped to the company, enforcing access.
     */
    private function resolveProposal(string $slug, int $proposalId): ClientProposal
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return ClientProposal::where('id', $proposalId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->with('items')
            ->firstOrFail();
    }
}
