<?php

namespace App\Console\Commands\ClientManagement;

use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\ClientInvoiceOperationsService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;

#[Signature('client-management:invoices
    {--client= : Client company id or slug. Omit to list invoices across all clients.}
    {--status=* : Filter by invoice status. Repeat or pass comma-separated values: draft, issued, paid, void.}
    {--user=1 : Admin user id to authorize command use; defaults to uid 1.}
    {--format=table : Output format: table or json.}')]
#[Description('List client-management invoices with payment and balance totals.')]
class ListInvoicesCommand extends BaseClientManagementCommand
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

        $company = null;
        $client = $this->option('client');
        if (is_string($client) && $client !== '') {
            $company = $this->resolveCompany($client);

            if (! $company) {
                return self::FAILURE;
            }
        }

        $statuses = $this->statuses();
        if ($statuses === null) {
            return self::FAILURE;
        }

        $invoices = $this->invoiceOperationsService->listInvoices($company, $statuses);
        $data = $this->invoiceOperationsService->summarizeInvoices($invoices);

        if ($format === 'json') {
            $this->outputJson($data);

            return self::SUCCESS;
        }

        $this->table(
            ['ID', 'Invoice', 'Client', 'Status', 'Period', 'Total', 'Paid', 'Balance', 'Unused Hrs', 'Negative Hrs'],
            $invoices->map(fn (ClientInvoice $invoice): array => [
                $invoice->client_invoice_id,
                $invoice->invoice_number,
                $invoice->clientCompany?->company_name,
                $invoice->status,
                $invoice->period_start?->toDateString().' - '.$invoice->period_end?->toDateString(),
                number_format((float) $invoice->invoice_total, 2),
                number_format((float) $invoice->payments_total, 2),
                number_format((float) $invoice->remaining_balance, 2),
                number_format((float) $invoice->unused_hours_balance, 2),
                number_format((float) $invoice->negative_hours_balance, 2),
            ])->all()
        );

        return self::SUCCESS;
    }

    /**
     * @return list<string>|null
     */
    private function statuses(): ?array
    {
        $statuses = [];

        foreach ((array) $this->option('status') as $statusOption) {
            foreach (explode(',', (string) $statusOption) as $status) {
                $status = trim($status);
                if ($status !== '') {
                    $statuses[] = $status;
                }
            }
        }

        $statuses = array_values(array_unique($statuses));
        $invalid = array_values(array_diff($statuses, ClientInvoiceOperationsService::STATUSES));

        if ($invalid !== []) {
            $this->error('Invalid status filter: '.implode(', ', $invalid).'. Use '.implode(', ', ClientInvoiceOperationsService::STATUSES).'.');

            return null;
        }

        return $statuses;
    }
}
