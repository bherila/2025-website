<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use Illuminate\Support\Facades\Gate;

class ClientPortalController extends Controller
{
    /**
     * Display the client portal for a company.
     */
    public function index($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        return view('client-management.portal.index', [
            'company' => $company,
            'slug' => $slug,
        ]);
    }

    /**
     * Display the time tracking page for a company.
     */
    public function time($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        return view('client-management.portal.time', [
            'company' => $company,
            'slug' => $slug,
        ]);
    }

    /**
     * Display a specific project.
     */
    public function project($slug, $projectSlug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        return view('client-management.portal.project', [
            'company' => $company,
            'project' => $project,
            'slug' => $slug,
        ]);
    }

    /**
     * Display the invoices list for a company.
     */
    public function invoices($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        return view('client-management.portal.invoices', [
            'company' => $company,
            'slug' => $slug,
        ]);
    }

    /**
     * Display a specific invoice.
     */
    public function invoice($slug, $invoiceId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)
            ->where('client_company_id', $company->id)
            ->whereIn('status', ['issued', 'paid'])
            ->firstOrFail();

        return view('client-management.portal.invoice', [
            'company' => $company,
            'invoice' => $invoice,
            'slug' => $slug,
        ]);
    }
}
