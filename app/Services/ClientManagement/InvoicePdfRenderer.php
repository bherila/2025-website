<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientInvoice;
use Barryvdh\DomPDF\Facade\Pdf;

class InvoicePdfRenderer
{
    /**
     * Render a client invoice to a PDF document.
     *
     * Builds the view payload from the invoice's canonical detailed array plus
     * the related client company (bill-to context) and the configured app name
     * (issuer/seller). All money values are pre-computed by the model and are
     * display-only here.
     *
     * @return string Raw PDF bytes.
     */
    public function render(ClientInvoice $invoice): string
    {
        $invoice->loadMissing('clientCompany');
        $company = $invoice->clientCompany;

        $data = [
            'invoice' => $invoice->toDetailedArray(),
            'issuer_name' => config('app.name'),
            'company' => [
                'company_name' => $company?->company_name,
                'address' => $company?->address,
                'billing_email' => $company?->billing_email,
                'website' => $company?->website,
                'phone_number' => $company?->phone_number,
            ],
            'generated_at' => now()->toDayDateTimeString(),
        ];

        return Pdf::loadView('client-management.invoices.pdf', $data)->output();
    }
}
