<?php

namespace App\Mail;

use App\Models\ClientManagement\ClientProposal;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Notifies the admin when a client takes an action on a proposal
 * (sent / accepted / rejected / changes requested).
 */
class ProposalActionMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  string  $action  One of: sent, accepted, rejected, changes_requested
     */
    public function __construct(
        public ClientProposal $proposal,
        public string $action,
    ) {}

    public function envelope(): Envelope
    {
        $company = $this->proposal->clientCompany?->company_name ?? 'Client';
        $verb = match ($this->action) {
            'accepted' => 'accepted',
            'rejected' => 'rejected',
            'changes_requested' => 'requested changes on',
            'sent' => 'sent',
            default => 'updated',
        };

        return new Envelope(
            subject: "{$company} {$verb} proposal: {$this->proposal->title} (v{$this->proposal->version})",
        );
    }

    public function content(): Content
    {
        $this->proposal->loadMissing(['clientCompany', 'items']);

        $selectedItems = $this->proposal->items
            ->filter(fn ($item): bool => (bool) $item->is_selected)
            ->map(fn ($item): array => [
                'description' => $item->description,
                'amount' => $item->amount,
            ])
            ->values()
            ->all();

        return new Content(
            markdown: 'emails.proposals.action',
            with: [
                'action' => $this->action,
                'companyName' => $this->proposal->clientCompany?->company_name ?? 'Client',
                'title' => $this->proposal->title,
                'version' => $this->proposal->version,
                'clientResponse' => $this->proposal->client_response_message,
                'responderName' => $this->proposal->accept_signature_name ?? $this->proposal->response_name,
                'responderTitle' => $this->proposal->accept_signature_title ?? $this->proposal->response_title,
                'acceptedNet' => $this->action === 'accepted' ? $this->proposal->upfrontNet() : null,
                'selectedItems' => $selectedItems,
                'url' => route('client-management.proposal.show', $this->proposal->id),
            ],
        );
    }
}
