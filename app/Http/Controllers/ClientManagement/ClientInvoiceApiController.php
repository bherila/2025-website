<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\ClientInvoicingService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

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

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        $invoice->load(['agreement', 'lineItems.timeEntries']);

        return response()->json([
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
            'negative_hours_balance' => $invoice->negative_hours_balance,
            'hours_billed_at_rate' => $invoice->hours_billed_at_rate,
            'rollover_hours_used' => $invoice->rollover_hours_used,
            'notes' => $invoice->notes,
            'agreement' => $invoice->agreement ? [
                'id' => $invoice->agreement->id,
                'monthly_retainer_hours' => $invoice->agreement->monthly_retainer_hours,
                'monthly_retainer_fee' => $invoice->agreement->monthly_retainer_fee,
                'hourly_rate' => $invoice->agreement->hourly_rate,
            ] : null,
            'line_items' => $invoice->lineItems->map(function ($line) {
                return [
                    'id' => $line->client_invoice_line_id,
                    'description' => $line->description,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                    'line_type' => $line->line_type,
                    'hours' => $line->hours,
                    'time_entries_count' => $line->timeEntries->count(),
                ];
            }),
        ]);
    }

    /**
     * Preview an invoice before generating it.
     */
    public function preview(Request $request, ClientCompany $company)
    {
        Gate::authorize('Admin');

        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after:period_start',
        ]);

        try {
            $preview = $this->invoicingService->previewInvoice(
                $company,
                Carbon::parse($request->period_start),
                Carbon::parse($request->period_end)
            );

            return response()->json($preview);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
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
     * Update invoice notes.
     */
    public function update(Request $request, ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
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

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status !== 'draft') {
            return response()->json(['error' => 'Only draft invoices can be issued'], 400);
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

        if ($invoice->client_company_id !== $company->id) {
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
    public function void(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status === 'paid') {
            return response()->json(['error' => 'Paid invoices cannot be voided'], 400);
        }

        // Unlink time entries from this invoice's lines
        foreach ($invoice->lineItems as $line) {
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
        }

        $invoice->void();

        return response()->json(['message' => 'Invoice voided successfully']);
    }

    /**
     * Delete a draft invoice.
     */
    public function destroy(ClientCompany $company, ClientInvoice $invoice)
    {
        Gate::authorize('Admin');

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if ($invoice->status !== 'draft') {
            return response()->json(['error' => 'Only draft invoices can be deleted'], 400);
        }

        // Unlink time entries
        foreach ($invoice->lineItems as $line) {
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
            $line->delete();
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

        if ($invoice->client_company_id !== $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! $invoice->isEditable()) {
            return response()->json(['error' => 'Invoice cannot be edited in its current status'], 400);
        }

        $request->validate([
            'description' => 'required|string|max:255',
            'quantity' => 'required|numeric|min:0',
            'unit_price' => 'required|numeric',
            'line_type' => 'required|in:expense,adjustment,credit',
        ]);

        $lineTotal = $request->quantity * $request->unit_price;

        $maxSortOrder = $invoice->lineItems()->max('sort_order') ?? 0;

        $line = $invoice->lineItems()->create([
            'description' => $request->description,
            'quantity' => $request->quantity,
            'unit_price' => $request->unit_price,
            'line_total' => $lineTotal,
            'line_type' => $request->line_type,
            'sort_order' => $maxSortOrder + 1,
        ]);

        $invoice->recalculateTotal();

        return response()->json([
            'message' => 'Line item added successfully',
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

        if ($invoice->client_company_id !== $company->id) {
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

        // Unlink any time entries
        $line->timeEntries()->update(['client_invoice_line_id' => null]);
        $line->delete();

        $invoice->recalculateTotal();

        return response()->json([
            'message' => 'Line item removed successfully',
            'new_invoice_total' => $invoice->fresh()->invoice_total,
        ]);
    }
}
