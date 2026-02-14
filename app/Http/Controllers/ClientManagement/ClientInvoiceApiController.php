<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;

class ClientInvoiceApiController extends Controller
{
    protected ClientInvoicingService $invoicingService;

    public function __construct(ClientInvoicingService $invoicingService)
    {
        $this->invoicingService = $invoicingService;
    }

    /**
     * List all invoices for a company.
     */
    public function index(ClientCompany $company)
    {
        Gate::authorize('Admin');

        $invoices = ClientInvoice::where('client_company_id', $company->id)
            ->with(['agreement', 'lineItems'])
            ->orderBy('period_start', 'desc')
            ->get()
            ->map(function ($invoice) {
                return [
                    'id' => $invoice->client_invoice_id,
                    'invoice_number' => $invoice->invoice_number,
                    'period_start' => $invoice->period_start->toDateString(),
                    'period_end' => $invoice->period_end->toDateString(),
                    'invoice_total' => $invoice->invoice_total,
                    'status' => $invoice->status,
                    'issue_date' => $invoice->issue_date?->toDateString(),
                    'due_date' => $invoice->due_date?->toDateString(),
                    'paid_date' => $invoice->paid_date?->toDateString(),
                    'hours_worked' => $invoice->hours_worked,
                    'retainer_hours_included' => $invoice->retainer_hours_included,
                    'unused_hours_balance' => $invoice->unused_hours_balance,
                    'hours_billed_at_rate' => $invoice->hours_billed_at_rate,
                    'rollover_hours_used' => $invoice->rollover_hours_used,
                ];
            });

        return response()->json($invoices);
    }

    /**
     * Get a single invoice with full details.
     */
    public function show(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            Log::debug('unVoid: company mismatch', [
                'route_company_id' => $company->id,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ]);

            return response()->json([
                'error' => 'Invoice does not belong to this company',
                'route_company_id' => $company->id,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ], 404);
        }

        // Use the model's canonical serializer so admin and portal controllers stay consistent
        return response()->json($invoice->toDetailedArray());
    }

    /**
     * Generate a new invoice.
     */
    public function store(Request $request, ClientCompany $company)
    {
        Gate::authorize('Admin');

        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after:period_start',
        ]);

        try {
            $invoice = $this->invoicingService->generateInvoice(
                $company,
                Carbon::parse($request->period_start),
                Carbon::parse($request->period_end)
            );

            return response()->json([
                'message' => 'Invoice generated successfully',
                'invoice' => [
                    'id' => $invoice->client_invoice_id,
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_total' => $invoice->invoice_total,
                    'status' => $invoice->status,
                ],
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Generate invoices for all calendar months.
     */
    public function generateAll(ClientCompany $company)
    {
        Gate::authorize('Admin');

        try {
            $results = $this->invoicingService->generateAllMonthlyInvoices($company);

            return response()->json([
                'message' => 'Invoice generation completed',
                'results' => $results,
            ], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Update invoice notes.
     */
    public function update(Request $request, ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            Log::debug('unVoid: company mismatch', [
                'route_company_id' => $company->id,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ]);

            return response()->json([
                'error' => 'Invoice does not belong to this company',
                'route_company_id' => $company->id,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ], 404);
        }

        $request->validate([
            'notes' => 'nullable|string',
            'due_date' => 'nullable|date',
        ]);

        if (! $invoice->isEditable()) {
            return response()->json(['error' => 'Invoice cannot be edited in its current status'], 400);
        }

        $invoice->update($request->only(['notes', 'due_date']));

        return response()->json(['message' => 'Invoice updated successfully']);
    }

    /**
     * Issue an invoice.
     */
    public function issue(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status !== 'draft') {
            return response()->json(['error' => 'Only draft invoices can be issued'], 400);
        }

        // Check if period_end is in the future
        if ($invoice->period_end && $invoice->period_end->isFuture()) {
            return response()->json(['error' => 'Cannot issue invoice until after the period ends'], 400);
        }

        $invoice->issue();

        return response()->json(['message' => 'Invoice issued successfully']);
    }

    /**
     * Mark an invoice as paid.
     */
    public function markPaid(Request $request, ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! in_array($invoice->status, ['issued', 'draft'])) {
            return response()->json(['error' => 'Invoice cannot be marked as paid in its current status'], 400);
        }

        $invoice->markPaid();

        return response()->json(['message' => 'Invoice marked as paid']);
    }

    /**
     * Void an invoice.
     */
    public function void(ClientCompany $company, $invoiceId)
    {
        Gate::authorize('Admin');

        $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)->firstOrFail();

        // Check if there are any payments on the invoice first (return 400 if present)
        if (ClientInvoicePayment::where('client_invoice_id', $invoice->client_invoice_id)->exists()) {
            return response()->json(['error' => 'Invoices with payments cannot be voided. Please delete all payments first.'], 400);
        }

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status === 'paid') {
            return response()->json(['error' => 'Paid invoices cannot be voided'], 400);
        }

        $invoice->void();

        return response()->json(['message' => 'Invoice voided successfully']);
    }

    /**
     * Revert a voided invoice to issued or draft status.
     */
    public function unVoid(Request $request, ClientCompany $company, $invoiceId)
    {
        Gate::authorize('Admin');

        $invoice = ClientInvoice::where('client_invoice_id', $invoiceId)->firstOrFail();

        // Some tests disable middleware which can prevent route model binding.
        // Fall back to the raw route parameter when `$company->id` is not available.
        $routeCompanyId = is_object($company) && isset($company->id)
            ? $company->id
            : $request->route('company');

        if ($invoice->client_company_id != $routeCompanyId) {
            Log::debug('unVoid: company mismatch', [
                'route_company_id' => $routeCompanyId,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ]);

            return response()->json([
                'error' => 'Invoice does not belong to this company',
                'route_company_id' => $routeCompanyId,
                'invoice_id' => $invoice->client_invoice_id,
                'invoice_company_id' => $invoice->client_company_id,
                'invoice_status' => $invoice->status,
            ], 404);
        }

        if ($invoice->status !== 'void') {
            return response()->json(['error' => 'Only voided invoices can be un-voided'], 400);
        }

        $targetStatus = $request->input('status', 'issued');
        if (! in_array($targetStatus, ['issued', 'draft'])) {
            return response()->json(['error' => 'Target status must be "issued" or "draft"'], 400);
        }

        $invoice->unVoid($targetStatus);

        return response()->json(['message' => 'Invoice status reverted successfully']);
    }

    /**
     * Delete a draft invoice.
     */
    public function destroy(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status !== 'draft') {
            return response()->json(['error' => 'Only draft invoices can be deleted'], 400);
        }

        $invoice->delete();

        return response()->json(['message' => 'Invoice deleted successfully']);
    }

    /**
     * Add a custom line item to a draft invoice.
     */
    public function addLineItem(Request $request, ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! $invoice->isEditable()) {
            return response()->json(['error' => 'Invoice cannot be edited in its current status'], 400);
        }

        $request->validate([
            'description' => 'required|string|max:255',
            'quantity' => 'required|string',
            'unit_price' => 'required|numeric',
            'line_type' => 'required|in:expense,adjustment,credit',
        ]);

        $maxSortOrder = $invoice->lineItems()->max('sort_order') ?? 0;

        $line = $invoice->lineItems()->create([
            'description' => $request->description,
            'quantity' => $request->quantity,
            'unit_price' => $request->unit_price,
            'line_total' => 0, // Will be calculated below
            'line_type' => $request->line_type,
            'sort_order' => $maxSortOrder + 1,
        ]);

        $line->calculateTotal();
        $invoice->recalculateTotal();

        return response()->json([
            'line_item' => [
                'id' => $line->client_invoice_line_id,
                'description' => $line->description,
                'line_total' => $line->line_total,
            ],
            'new_invoice_total' => $invoice->fresh()->invoice_total,
        ], 201);
    }

    /**
     * Remove a custom line item from a draft invoice.
     */
    public function removeLineItem(ClientCompany $company, ClientInvoice $invoice, int $lineId)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! $invoice->isEditable()) {
            return response()->json(['error' => 'Invoice cannot be edited in its current status'], 400);
        }

        $line = $invoice->lineItems()->where('client_invoice_line_id', $lineId)->first();

        if (! $line) {
            return response()->json(['error' => 'Line item not found'], 404);
        }

        // Don't allow removing the retainer line
        if ($line->line_type === 'retainer') {
            return response()->json(['error' => 'Cannot remove the retainer line item'], 400);
        }

        $line->delete();

        $invoice->recalculateTotal();

        return response()->json([
            'message' => 'Line item removed successfully',
            'new_invoice_total' => $invoice->fresh()->invoice_total,
        ]);
    }

    /**
     * Update a custom line item on a draft invoice.
     */
    public function updateLineItem(Request $request, ClientCompany $company, ClientInvoice $invoice, int $lineId)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id != $company->id || ! $invoice->isEditable()) {
            abort(403);
        }

        $request->validate([
            'description' => 'required|string|max:255',
            'quantity' => 'required|string',
            'unit_price' => 'required|numeric',
        ]);

        $line = $invoice->lineItems()->where('client_invoice_line_id', $lineId)->firstOrFail();

        if ($line->line_type === 'retainer' || $line->line_type === 'additional_hours') {
            return response()->json(['error' => 'Cannot edit system-generated line items.'], 400);
        }

        $line->update([
            'description' => $request->description,
            'quantity' => $request->quantity,
            'unit_price' => $request->unit_price,
        ]);

        $line->calculateTotal();
        $invoice->recalculateTotal();

        return response()->json([
            'message' => 'Line item updated successfully',
            'line_item' => $line->fresh(),
            'new_invoice_total' => $invoice->fresh()->invoice_total,
        ]);
    }

    //
    // Payment Methods
    //

    public function getPayments(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');
        if ($invoice->client_company_id != $company->id) {
            abort(404);
        }

        return response()->json($invoice->payments()->orderBy('payment_date', 'desc')->get());
    }

    public function addPayment(Request $request, ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');
        if ($invoice->client_company_id != $company->id) {
            abort(404);
        }

        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'payment_method' => 'required|string|in:Credit Card,ACH,Wire,Check,Other',
            'notes' => 'nullable|string',
        ]);

        // Check if payment amount would exceed remaining balance
        $invoiceFresh = $invoice->fresh(['payments']);
        $remainingBalance = (float) $invoiceFresh->remaining_balance;
        $paymentAmount = (float) $request->input('amount');
        
        if ($paymentAmount > $remainingBalance) {
            return response()->json([
                'message' => 'Payment amount exceeds remaining balance.',
                'remaining_balance' => number_format($remainingBalance, 2),
            ], 422);
        }

        $payment = $invoice->payments()->create($request->all());

        // Update invoice status if fully paid
        $invoiceFresh = $invoice->fresh(['payments']);
        if ($invoiceFresh->remaining_balance <= 0) {
            // Set paid_date to the latest payment date
            $latestPaymentDate = $invoiceFresh->payments()->max('payment_date');
            $invoice->markPaid($latestPaymentDate);
        }

        return response()->json([
            'message' => 'Payment added successfully.',
            'payment' => $payment,
            'invoice' => $invoice->fresh(['payments']),
        ], 201);
    }

    public function updatePayment(Request $request, ClientCompany $company, ClientInvoice $invoice, ClientInvoicePayment $payment)
    {
        Gate::authorize('Admin');
        if ($invoice->client_company_id != $company->id || $payment->client_invoice_id != $invoice->client_invoice_id) {
            abort(404);
        }

        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'payment_method' => 'required|string|in:Credit Card,ACH,Wire,Check,Other',
            'notes' => 'nullable|string',
        ]);

        // Check if updated payment amount would exceed remaining balance
        // (remaining balance + current payment amount - new payment amount should be >= 0)
        $invoiceFresh = $invoice->fresh(['payments']);
        $remainingBalance = (float) $invoiceFresh->remaining_balance;
        $currentPaymentAmount = (float) $payment->amount;
        $newPaymentAmount = (float) $request->input('amount');
        $balanceAfterUpdate = $remainingBalance + $currentPaymentAmount - $newPaymentAmount;
        
        if ($balanceAfterUpdate < 0) {
            return response()->json([
                'message' => 'Updated payment amount would exceed invoice total.',
                'max_payment_amount' => number_format($remainingBalance + $currentPaymentAmount, 2),
            ], 422);
        }

        $payment->update($request->all());

        // Update invoice status
        $invoiceFresh = $invoice->fresh(['payments']);
        if ($invoiceFresh->remaining_balance <= 0) {
            if ($invoice->status !== 'paid') {
                // Set paid_date to the latest payment date
                $latestPaymentDate = $invoiceFresh->payments()->max('payment_date');
                $invoice->markPaid($latestPaymentDate);
            }
        } else {
            if ($invoice->status === 'paid') {
                $invoice->update(['status' => 'issued', 'paid_date' => null]);
            }
        }

        return response()->json([
            'message' => 'Payment updated successfully.',
            'payment' => $payment->fresh(),
            'invoice' => $invoice->fresh(['payments']),
        ]);
    }

    public function deletePayment(ClientCompany $company, ClientInvoice $invoice, ClientInvoicePayment $payment)
    {
        Gate::authorize('Admin');
        if ($invoice->client_company_id != $company->id || $payment->client_invoice_id != $invoice->client_invoice_id) {
            abort(404);
        }

        $payment->delete();

        // Update invoice status if it was previously paid
        if ($invoice->status === 'paid' && $invoice->fresh()->remaining_balance > 0) {
            $invoice->update(['status' => 'issued', 'paid_date' => null]);
        }

        return response()->json([
            'message' => 'Payment deleted successfully.',
            'invoice' => $invoice->fresh(['payments']),
        ]);
    }
}
