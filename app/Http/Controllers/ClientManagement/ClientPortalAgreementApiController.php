<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientPortalAgreementApiController extends Controller
{
    /**
     * Get visible agreements for a client company.
     */
    public function index($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $agreements = $company->agreements()
            ->where('is_visible_to_client', true)
            ->orderBy('active_date', 'desc')
            ->get();

        return response()->json($agreements);
    }

    /**
     * Get a single agreement.
     */
    public function show($slug, $agreementId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $agreement = ClientAgreement::where('id', $agreementId)
            ->where('client_company_id', $company->id)
            ->where('is_visible_to_client', true)
            ->with('signedByUser')
            ->firstOrFail();

        return response()->json($agreement);
    }

    /**
     * Sign an agreement.
     */
    public function sign(Request $request, $slug, $agreementId)
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
    public function getInvoices($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $query = $company->invoices();

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! auth()->user()->hasRole('admin')) {
            $query->whereIn('status', ['issued', 'paid']);
        }

        $invoices = $query->orderBy('issue_date', 'desc')
            ->orderBy('period_start', 'desc')
            ->get();

        return response()->json($invoices);
    }

    /**
     * Get a single invoice with line items.
     */
    public function getInvoice($slug, $invoiceId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', 'view', $company);

        $query = ClientInvoice::where('client_invoice_id', $invoiceId)
            ->where('client_company_id', $company->id)
            ->with(['lineItems', 'payments']);

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! auth()->user()->hasRole('admin')) {
            $query->whereIn('status', ['issued', 'paid']);
        }

        $invoice = $query->firstOrFail();

        return response()->json($invoice);
    }
}
