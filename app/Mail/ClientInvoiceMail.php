<?php

namespace App\Mail;

use App\Models\ClientManagement\ClientInvoice;
use App\Services\ClientManagement\InvoicePdfRenderer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Emails a client an issued/paid invoice with the rendered PDF attached.
 */
class ClientInvoiceMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public ClientInvoice $invoice,
        public ?string $note = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Invoice '.$this->invoiceNumber().' from '.config('app.name'),
        );
    }

    public function content(): Content
    {
        $this->invoice->loadMissing('clientCompany');
        $company = $this->invoice->clientCompany;

        $portalUrl = $company?->slug
            ? route('client-portal.invoice', ['slug' => $company->slug, 'invoiceId' => $this->invoice->client_invoice_id])
            : null;

        return new Content(
            markdown: 'emails.invoices.send',
            with: [
                'companyName' => $company?->company_name ?? 'there',
                'invoiceNumber' => $this->invoiceNumber(),
                'invoiceTotal' => (float) $this->invoice->invoice_total,
                'remainingBalance' => (float) $this->invoice->remaining_balance,
                'dueDate' => $this->invoice->due_date?->toFormattedDateString(),
                'note' => $this->note,
                'portalUrl' => $portalUrl,
            ],
        );
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(
                fn (): string => app(InvoicePdfRenderer::class)->render($this->invoice),
                'Invoice-'.$this->invoiceNumber().'.pdf',
            )->withMime('application/pdf'),
        ];
    }

    private function invoiceNumber(): string
    {
        return $this->invoice->invoice_number ?? (string) $this->invoice->client_invoice_id;
    }
}
