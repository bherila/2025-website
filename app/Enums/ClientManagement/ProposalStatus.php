<?php

namespace App\Enums\ClientManagement;

/**
 * Lifecycle status of a client proposal version.
 *
 * `draft` is admin-editable. `sent` is visible to the client and awaiting a
 * decision. `changes_requested` records a client's free-form change request
 * (the admin responds by creating a new version). `accepted`, `rejected`, and
 * `expired` are terminal.
 */
enum ProposalStatus: string
{
    case Draft = 'draft';
    case Sent = 'sent';
    case ChangesRequested = 'changes_requested';
    case Accepted = 'accepted';
    case Rejected = 'rejected';
    case Expired = 'expired';

    /**
     * Human-readable label.
     */
    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Sent => 'Sent',
            self::ChangesRequested => 'Changes Requested',
            self::Accepted => 'Accepted',
            self::Rejected => 'Rejected',
            self::Expired => 'Expired',
        };
    }

    /**
     * Terminal statuses cannot transition to any other status.
     */
    public function isTerminal(): bool
    {
        return match ($this) {
            self::Accepted, self::Rejected, self::Expired => true,
            default => false,
        };
    }

    /**
     * Whether a client may accept/reject/request-changes from this status.
     */
    public function canClientAct(): bool
    {
        return match ($this) {
            self::Sent, self::ChangesRequested => true,
            default => false,
        };
    }
}
