<?php

namespace App\Http\Controllers\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\StoreClientProposalRequest;
use App\Http\Requests\ClientManagement\UpdateClientProposalRequest;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Services\ClientManagement\ProposalService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class ClientProposalApiController extends Controller
{
    public function __construct(private ProposalService $proposals) {}

    /**
     * List all proposals (newest chain/version first) for a company.
     *
     * @return Collection<int, ClientProposal>
     */
    public function index(int $companyId): Collection
    {
        Gate::authorize('Admin');

        $company = ClientCompany::findOrFail($companyId);

        return $company->proposals()
            ->with('items')
            ->orderByDesc('root_id')
            ->orderByDesc('version')
            ->get();
    }

    public function show(int $id): ClientProposal
    {
        Gate::authorize('Admin');

        return ClientProposal::with([
            'items',
            'clientCompany',
            'agreement',
            'project',
            'acceptedByUser',
            'respondedByUser',
            'versions:id,root_id,version,status,created_at',
        ])->findOrFail($id);
    }

    public function store(StoreClientProposalRequest $request): JsonResponse
    {
        Gate::authorize('Admin');

        $data = $request->validated();
        $company = ClientCompany::findOrFail($data['client_company_id']);
        $items = $data['items'] ?? [];
        unset($data['client_company_id'], $data['items']);

        $proposal = $this->proposals->createBlank($company);
        $proposal = $this->proposals->update($proposal, $data, $items);

        return response()->json(['success' => true, 'proposal' => $proposal->load('items')], 201);
    }

    public function update(UpdateClientProposalRequest $request, int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::findOrFail($id);
        $data = $request->validated();
        $items = array_key_exists('items', $data) ? $data['items'] : null;
        unset($data['items']);

        try {
            $proposal = $this->proposals->update($proposal, $data, $items);
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json(['success' => true, 'proposal' => $proposal->load('items')]);
    }

    public function destroy(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::findOrFail($id);

        if ($proposal->isAccepted()) {
            return response()->json(['error' => 'Cannot delete an accepted proposal.'], 422);
        }

        $proposal->items()->delete();
        $proposal->delete();

        return response()->json(['success' => true]);
    }

    public function send(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::with('clientCompany')->findOrFail($id);

        try {
            $proposal = $this->proposals->send($proposal, auth()->user());
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json(['success' => true, 'proposal' => $proposal->load('items')]);
    }

    public function createRevision(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::with(['clientCompany', 'items'])->findOrFail($id);
        $revision = $this->proposals->createRevision($proposal, auth()->user());

        return response()->json(['success' => true, 'proposal' => $revision->load('items')], 201);
    }

    public function preview(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $proposal = ClientProposal::with('items')->findOrFail($id);

        return response()->json($this->proposals->previewUpfrontTotal($proposal));
    }
}
