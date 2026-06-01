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

    private function rawPrefix(ClientCompany $company): string
    {
        $alphanumericName = preg_replace('/[^a-zA-Z0-9]/', '', (string) $company->company_name) ?? '';

        return strtoupper(substr($alphanumericName, 0, 4));
    }
}
