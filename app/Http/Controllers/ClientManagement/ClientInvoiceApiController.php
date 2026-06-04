<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\GenerateInterimOverageInvoiceRequest;
use App\Http\Requests\ClientManagement\SendClientInvoiceRequest;
use App\Http\Requests\ClientManagement\StoreClientInvoiceRequest;
use App\Mail\ClientInvoiceMail;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoicePayment;
use App\Services\ClientManagement\ClientInvoiceOperationsService;
use App\Services\ClientManagement\ClientInvoicingService;
use App\Services\ClientManagement\InvoicePdfRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ClientInvoiceApiController extends Controller
{
    protected ClientInvoicingService $invoicingService;

    public function __construct(
        ClientInvoicingService $invoicingService,
        private readonly ClientInvoiceOperationsService $invoiceOperationsService
    ) {
        $this->invoicingService = $invoicingService;
    }

    /**
     * List all invoices for a company.
     */
    public function index(ClientCompany $company): JsonResponse
    {

        $invoices = $this->invoiceOperationsService->summarizeInvoices(
            $this->invoiceOperationsService->listInvoices($company)
        );

        return response()->json($invoices);
    }

    /**
     * Get a single invoice with full details.
     */
    public function show(ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

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
     * List every invoice across all companies for the merged management view.
     * Rows carry the company name; the frontend filters/searches client-side.
     */
    public function indexAll(): JsonResponse
    {
        $invoices = $this->invoiceOperationsService->summarizeInvoices(
            $this->invoiceOperationsService->listInvoices()
        );

        return response()->json($invoices);
    }

    /**
     * Email (or re-email) an issued/paid invoice with the rendered PDF attached.
     */
    public function send(SendClientInvoiceRequest $request, ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {
        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! in_array($invoice->status, ['issued', 'paid'], true)) {
            return response()->json(['error' => 'Only issued or paid invoices can be emailed.'], 422);
        }

        $recipients = $request->recipients();
        $cc = $request->ccRecipients();

        Mail::to($recipients)
            ->cc($cc)
            ->queue(new ClientInvoiceMail($invoice, $request->note()));

        $invoice->update(['last_emailed_at' => now()]);

        if ($request->shouldSaveBillingEmail() && $company->billing_email !== $recipients[0]) {
            $company->update(['billing_email' => $recipients[0]]);
        }

        ClientCompanyActivity::record($company, 'invoice.emailed', $invoice, [
            'invoice_number' => $invoice->invoice_number,
            'invoice_kind' => $invoice->invoiceKindValue(),
            'recipients' => $recipients,
            'cc' => $cc,
        ]);

        return response()->json([
            'message' => 'Invoice emailed successfully.',
            'last_emailed_at' => $invoice->last_emailed_at?->toIso8601String(),
        ]);
    }

    /**
     * Stream the invoice as a PDF rendered from the Blade template.
     */
    public function downloadPdf(ClientCompany $company, ClientInvoice $invoice, InvoicePdfRenderer $renderer): Response
    {
        if ($invoice->client_company_id != $company->id) {
            abort(404);
        }

        if ($invoice->status === 'draft') {
            abort(422, 'Draft invoices cannot be downloaded as a PDF.');
        }

        $filename = 'Invoice-'.($invoice->invoice_number ?? $invoice->client_invoice_id).'.pdf';

        return response($renderer->render($invoice), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
        ]);
    }

    /**
     * Generate a new invoice.
     */
    public function store(StoreClientInvoiceRequest $request, ClientCompany $company): JsonResponse
    {

        try {
            $invoice = $this->invoicingService->generateInvoice(
                $company,
                $request->periodStart(),
                $request->periodEnd(),
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
     * Generate draft invoices through the company's current billing cadence windows.
     */
    public function generateAll(ClientCompany $company): JsonResponse
    {

        try {
            $results = $this->invoicingService->generateAllInvoices($company);

            return response()->json([
                'message' => 'Invoice generation completed',
                'results' => $results,
            ], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Generate one interim overage invoice for a completed month in a non-monthly cycle.
     */
    public function generateInterim(GenerateInterimOverageInvoiceRequest $request, ClientCompany $company): JsonResponse
    {

        try {
            $invoice = $this->invoicingService->generateInterimOverageInvoice($company, $request->periodStart());

            if (! $invoice) {
                return response()->json([
                    'message' => 'No interim overage invoice was needed for this period',
                    'invoice' => null,
                ]);
            }

            return response()->json([
                'message' => 'Interim overage invoice generated successfully',
                'invoice' => [
                    'id' => $invoice->client_invoice_id,
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_total' => $invoice->invoice_total,
                    'invoice_kind' => $invoice->invoiceKindValue(),
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
    public function update(Request $request, ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

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
    public function issue(ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

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
        ClientCompanyActivity::record($company, 'invoice.issued', $invoice, [
            'invoice_number' => $invoice->invoice_number,
            'invoice_kind' => $invoice->invoiceKindValue(),
            'invoice_total' => (float) $invoice->invoice_total,
        ]);

        return response()->json(['message' => 'Invoice issued successfully']);
    }

    /**
     * Mark an invoice as paid.
     */
    public function markPaid(Request $request, ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

        if ($invoice->client_company_id != $company->id) {
            return response()->json(['error' => 'Invoice does not belong to this company'], 404);
        }

        if (! in_array($invoice->status, ['issued', 'draft'])) {
            return response()->json(['error' => 'Invoice cannot be marked as paid in its current status'], 400);
        }

        $invoice->markPaid();
        ClientCompanyActivity::record($company, 'invoice.marked_paid', $invoice, [
            'invoice_number' => $invoice->invoice_number,
            'invoice_kind' => $invoice->invoiceKindValue(),
            'invoice_total' => (float) $invoice->invoice_total,
        ]);

        return response()->json(['message' => 'Invoice marked as paid']);
    }

    /**
     * Void an invoice.
     */
    public function void(ClientCompany $company, int $invoiceId): JsonResponse
    {

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
        ClientCompanyActivity::record($company, 'invoice.voided', $invoice, [
            'invoice_number' => $invoice->invoice_number,
            'invoice_kind' => $invoice->invoiceKindValue(),
            'invoice_total' => (float) $invoice->invoice_total,
        ]);

        return response()->json(['message' => 'Invoice voided successfully']);
    }

    /**
     * Revert a voided invoice to issued or draft status.
     */
    public function unVoid(Request $request, ClientCompany $company, int $invoiceId): JsonResponse
    {

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
    public function destroy(ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

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
    public function addLineItem(Request $request, ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {

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
    public function removeLineItem(ClientCompany $company, ClientInvoice $invoice, int $lineId): JsonResponse
    {

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
    public function updateLineItem(Request $request, ClientCompany $company, ClientInvoice $invoice, int $lineId): JsonResponse
    {

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

    public function getPayments(ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {
        if ($invoice->client_company_id != $company->id) {
            abort(404);
        }

        return response()->json($invoice->payments()->orderBy('payment_date', 'desc')->get());
    }

    public function addPayment(Request $request, ClientCompany $company, ClientInvoice $invoice): JsonResponse
    {
        if ($invoice->client_company_id != $company->id) {
            abort(404);
        }

        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'payment_method' => $this->manualPaymentMethodRule(),
            'notes' => 'nullable|string',
        ]);

        // Overpayments are permitted — the excess carries forward as a credit
        // applied to the next invoice(s). See docs/client-management/overpayment-credits.md.

        $payment = $this->invoiceOperationsService->addPayment($invoice, $request->all());

        return response()->json([
            'message' => 'Payment added successfully.',
            'payment' => $payment,
            'invoice' => $invoice->fresh(['payments']),
        ], 201);
    }

    public function updatePayment(Request $request, ClientCompany $company, ClientInvoice $invoice, ClientInvoicePayment $payment): JsonResponse
    {
        if ($invoice->client_company_id != $company->id || $payment->client_invoice_id != $invoice->client_invoice_id) {
            abort(404);
        }

        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'payment_method' => $this->paymentMethodRuleFor($payment),
            'notes' => 'nullable|string',
        ]);

        // Overpayments are permitted on update as well (see addPayment() for rationale).

        $payment = $this->invoiceOperationsService->updatePayment($invoice, $payment, $request->all());

        return response()->json([
            'message' => 'Payment updated successfully.',
            'payment' => $payment,
            'invoice' => $invoice->fresh(['payments']),
        ]);
    }

    public function deletePayment(ClientCompany $company, ClientInvoice $invoice, ClientInvoicePayment $payment): JsonResponse
    {
        if ($invoice->client_company_id != $company->id || $payment->client_invoice_id != $invoice->client_invoice_id) {
            abort(404);
        }

        $this->invoiceOperationsService->deletePayment($invoice, $payment);

        return response()->json([
            'message' => 'Payment deleted successfully.',
            'invoice' => $invoice->fresh(['payments']),
        ]);
    }

    private function manualPaymentMethodRule(): string
    {
        return 'required|string|in:Credit Card,ACH,Wire,Check,Other';
    }

    private function paymentMethodRuleFor(ClientInvoicePayment $payment): string
    {
        $methods = ['Credit Card', 'ACH', 'Wire', 'Check', 'Other'];

        if ($payment->client_invoice_stripe_payment_id !== null) {
            $methods = array_merge($methods, ['stripe_card', 'stripe_ach', 'stripe_refund']);
        }

        return 'required|string|in:'.implode(',', $methods);
    }
}
