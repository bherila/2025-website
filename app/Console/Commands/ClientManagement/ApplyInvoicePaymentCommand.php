<?php

namespace App\Console\Commands\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Services\ClientManagement\ClientInvoiceOperationsService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Support\Facades\Validator;

#[Signature('client-management:apply-payment
    {invoice : Invoice id or invoice number.}
    {amount : Payment amount in dollars.}
    {date : Payment date, e.g. 2026-05-14.}
    {--type=ach : Payment type: ach, credit-card, wire, check, or other.}
    {--notes= : Optional payment notes.}
    {--user=1 : Admin user id to act as; defaults to uid 1.}
    {--format=table : Output format: table or json.}')]
#[Description('Apply a manual payment to an issued client-management invoice.')]
class ApplyInvoicePaymentCommand extends BaseClientManagementCommand
{
    public function __construct(private readonly ClientInvoiceOperationsService $invoiceOperationsService)
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $format = (string) $this->option('format');
        if (! in_array($format, ['table', 'json'], true)) {
            $this->error("Invalid --format value '{$format}'. Use 'table' or 'json'.");

            return self::FAILURE;
        }

        if (! $this->resolveAdminUser()) {
            return self::FAILURE;
        }

        $invoice = $this->resolveInvoice((string) $this->argument('invoice'));
        if (! $invoice) {
            return self::FAILURE;
        }

        $paymentMethod = $this->invoiceOperationsService->normalizePaymentMethod((string) $this->option('type'));
        $payload = [
            'amount' => $this->argument('amount'),
            'payment_date' => $this->argument('date'),
            'payment_method' => $paymentMethod,
            'notes' => $this->option('notes'),
        ];

        $validator = Validator::make($payload, [
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'payment_method' => 'required|string|in:Credit Card,ACH,Wire,Check,Other',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        try {
            $payment = $this->invoiceOperationsService->addPayment($invoice, $payload, issuedOnly: true);
        } catch (ClientManagementActionException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $invoice->refresh()->load('payments', 'clientCompany');
        $data = [
            'payment_id' => $payment->client_invoice_payment_id,
            'invoice_id' => $invoice->client_invoice_id,
            'invoice_number' => $invoice->invoice_number,
            'client' => $invoice->clientCompany?->company_name,
            'amount' => (float) $payment->amount,
            'payment_date' => $payment->payment_date->toDateString(),
            'payment_method' => $payment->payment_method,
            'invoice_status' => $invoice->status,
            'remaining_balance' => (float) $invoice->remaining_balance,
        ];

        if ($format === 'json') {
            $this->outputJson($data);

            return self::SUCCESS;
        }

        $this->info('Payment applied.');
        $this->table(
            ['Payment ID', 'Invoice', 'Client', 'Amount', 'Date', 'Type', 'Invoice Status', 'Balance'],
            [[
                $data['payment_id'],
                $data['invoice_number'],
                $data['client'],
                number_format($data['amount'], 2),
                $data['payment_date'],
                $data['payment_method'],
                $data['invoice_status'],
                number_format($data['remaining_balance'], 2),
            ]]
        );

        return self::SUCCESS;
    }
}
