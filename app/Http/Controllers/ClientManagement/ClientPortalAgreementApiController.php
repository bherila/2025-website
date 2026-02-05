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

        return $company->agreements()
            ->where('is_visible_to_client', true)
            ->orderBy('active_date', 'desc')
            ->get();
    }

    /**
     * Get a single agreement.
     */
    public function show($slug, $agreementId)
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

        $isAdmin = auth()->user()->hasRole('admin');

        $query = $company->invoices();

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! $isAdmin) {
            $query->whereIn('status', ['issued', 'paid']);
        }

        return $query->orderBy('issue_date', 'desc')
            ->orderBy('period_start', 'desc')
            ->get();
    }

    /**
     * Get a single invoice with line items.
     */
    public function getInvoice($slug, $invoiceId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $isAdmin = auth()->user()->hasRole('admin');

        $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)
            ->where('client_company_id', $company->id)
            ->with(['lineItems.timeEntries', 'payments'])
            ->firstOrFail();

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! $isAdmin && ! in_array($invoice->status, ['issued', 'paid'])) {
            abort(404);
        }

        // Calculate hours breakdown using model method
        $hoursBreakdown = $invoice->calculateHoursBreakdown();

        $data = $invoice->toArray();
        $data['payments_total'] = $invoice->payments_total;
        $data['carried_in_hours'] = $hoursBreakdown['carried_in_hours'];
        $data['current_month_hours'] = $hoursBreakdown['current_month_hours'];
        $data['line_items'] = $invoice->lineItems->map(function ($line) {
            $timeEntries = $line->timeEntries()->select('name', 'minutes_worked', 'date_worked')->get();
            return [
                'client_invoice_line_id' => $line->client_invoice_line_id,
                'description' => $line->description,
                'quantity' => $line->quantity,
                'unit_price' => $line->unit_price,
                'line_total' => $line->line_total,
                'line_type' => $line->line_type,
                'hours' => $line->hours,
                'time_entries' => $timeEntries,
            ];
        });

        // Get previous and next invoice IDs
        $navQuery = ClientInvoice::where('client_company_id', $company->id);
        if (! $isAdmin) {
            $navQuery->whereIn('status', ['issued', 'paid']);
        }

        $data['previous_invoice_id'] = (clone $navQuery)
            ->where(function ($q) use ($invoice) {
                $q->where('period_start', '<', $invoice->period_start)
                    ->orWhere(function ($q2) use ($invoice) {
                        $q2->where('period_start', '=', $invoice->period_start)
                            ->where('client_invoice_id', '<', $invoice->client_invoice_id);
                    });
            })
            ->orderBy('period_start', 'desc')
            ->orderBy('client_invoice_id', 'desc')
            ->value('client_invoice_id');

        $data['next_invoice_id'] = (clone $navQuery)
            ->where(function ($q) use ($invoice) {
                $q->where('period_start', '>', $invoice->period_start)
                    ->orWhere(function ($q2) use ($invoice) {
                        $q2->where('period_start', '=', $invoice->period_start)
                            ->where('client_invoice_id', '>', $invoice->client_invoice_id);
                    });
            })
            ->orderBy('period_start', 'asc')
            ->orderBy('client_invoice_id', 'asc')
            ->value('client_invoice_id');

        return $data;
    }
}
