<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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

        return Cache::remember("client_portal_agreements_{$slug}", 60, function () use ($company) {
            return $company->agreements()
                ->where('is_visible_to_client', true)
                ->orderBy('active_date', 'desc')
                ->get();
        });
    }

    /**
     * Get a single agreement.
     */
    public function show($slug, $agreementId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return Cache::remember("client_portal_agreement_{$slug}_{$agreementId}", 60, function () use ($company, $agreementId) {
            return ClientAgreement::where('id', $agreementId)
                ->where('client_company_id', $company->id)
                ->where('is_visible_to_client', true)
                ->with('signedByUser')
                ->firstOrFail();
        });
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

        // Invalidate caches
        Cache::forget("client_portal_agreement_{$slug}_{$agreementId}");
        Cache::forget("client_portal_agreements_{$slug}");
        Cache::forget("client_admin_agreement_{$agreementId}");
        Cache::forget("client_admin_agreements_{$company->id}");

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

        $isAdmin = auth()->user()->hasRole('admin');
        $cacheKey = "client_portal_invoices_{$slug}_" . ($isAdmin ? 'admin' : 'client');

        return Cache::remember($cacheKey, 60, function () use ($company, $isAdmin) {
            $query = $company->invoices();

            // Admins can see all invoices, but clients can only see issued or paid ones.
            if (! $isAdmin) {
                $query->whereIn('status', ['issued', 'paid']);
            }

            return $query->orderBy('issue_date', 'desc')
                ->orderBy('period_start', 'desc')
                ->get();
        });
    }

    /**
     * Get a single invoice with line items.
     */
    public function getInvoice($slug, $invoiceId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $isAdmin = auth()->user()->hasRole('admin');
        $cacheKey = "client_portal_invoice_{$slug}_{$invoiceId}_" . ($isAdmin ? 'admin' : 'client');

        return Cache::remember($cacheKey, 60, function () use ($company, $invoiceId, $isAdmin) {
            $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)
                ->where('client_company_id', $company->id)
                ->with(['lineItems', 'payments'])
                ->firstOrFail();

            // Admins can see all invoices, but clients can only see issued or paid ones.
            if (! $isAdmin && ! in_array($invoice->status, ['issued', 'paid'])) {
                abort(404);
            }

            $data = $invoice->toArray();
            $data['payments_total'] = $invoice->payments_total;
            $data['line_items'] = $invoice->lineItems->map(function ($line) {
                return [
                    'client_invoice_line_id' => $line->client_invoice_line_id,
                    'description' => $line->description,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                    'line_type' => $line->line_type,
                    'hours' => $line->hours,
                ];
            });

            return $data;
        });
    }
}
