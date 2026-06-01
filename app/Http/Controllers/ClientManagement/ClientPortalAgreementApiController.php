<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientPortalAgreementApiController extends Controller
{
    /**
     * Get visible agreements for a client company.
     */
    public function index(string $slug): Collection
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return $company->agreements()
            ->where('is_visible_to_client', true)
            ->orderBy('active_date', 'desc')
            ->get();
    }

    /**
     * Get a single agreement.
     */
    public function show(string $slug, int $agreementId): ClientAgreement
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->with('signedByUser')
            ->firstOrFail();
    }

    /**
     * Sign an agreement.
     */
    public function sign(Request $request, string $slug, int $agreementId): JsonResponse
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->firstOrFail();

        if ($agreement->isSigned()) {
            return response()->json([
                'error' => 'This agreement has already been signed.',
            ], 422);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'title' => 'required|string|max:255',
        ]);

        $agreement->sign(auth()->user(), $validated['name'], $validated['title']);

        return response()->json([
            'success' => true,
            'agreement' => $agreement->fresh('signedByUser'),
        ]);
    }

    /**
     * Get invoices for the client company.
     */
    public function getInvoices(string $slug): Collection
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $isAdmin = auth()->user()->hasRole('admin');

        $query = $company->invoices();

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! $isAdmin) {
            $query->visibleToClientPortal();
        }

        return $query->orderBy('issue_date', 'desc')
            ->orderBy('period_start', 'desc')
            ->get();
    }

    /**
     * Get a single invoice with line items.
     *
     * @return array<string, mixed>
     */
    public function getInvoice(string $slug, int $invoiceId): array
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $isAdmin = auth()->user()->hasRole('admin');

        $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)
            ->where('client_company_id', $company->id)
            ->with(['lineItems.timeEntries', 'payments'])
            ->firstOrFail();

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! $isAdmin && ! in_array($invoice->status, ClientInvoice::CLIENT_VISIBLE_STATUSES, true)) {
            abort(404);
        }

        // Use canonical serializer from the model (includes hours breakdown, payments_total, line_items, etc.)
        $data = $invoice->toDetailedArray();

        return array_merge(
            $data,
            $invoice->portalNavigationIds(includeDrafts: $isAdmin)
        );
    }
}
