<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use Carbon\Carbon;

class InvoiceNumberGenerator
{
    public function generate(ClientCompany $company, Carbon $periodEnd): string
    {
        $rawPrefix = $this->rawPrefix($company);
        $prefix = $rawPrefix !== '' ? "{$rawPrefix}-" : '';
        $yearMonth = $periodEnd->format('Ym');

        $lastInvoice = ClientInvoice::query()
            ->where('client_company_id', $company->id)
            ->where('invoice_number', 'like', "{$rawPrefix}%{$yearMonth}-%")
            ->orderBy('invoice_number', 'desc')
            ->first();

        $sequence = $lastInvoice
            ? ((int) substr((string) $lastInvoice->invoice_number, -3)) + 1
            : 1;

        return sprintf('%s%s-%03d', $prefix, $yearMonth, $sequence);
    }

    /**
     * Number anchored to the issue month (the month after the work period).
     * Prior-period invoices are issued on the 1st of the month following the
     * work they reconcile, so the number reflects that issue month rather than
     * the work month carried on period_start/period_end.
     */
    public function generateForIssueMonth(ClientCompany $company, Carbon $workPeriodEnd): string
    {
        return $this->generate($company, $workPeriodEnd->copy()->addDay()->startOfMonth());
    }

    private function rawPrefix(ClientCompany $company): string
    {
        $alphanumericName = preg_replace('/[^a-zA-Z0-9]/', '', (string) $company->company_name) ?? '';

        return strtoupper(substr($alphanumericName, 0, 4));
    }
}
