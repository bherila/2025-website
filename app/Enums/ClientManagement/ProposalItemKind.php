<?php

namespace App\Enums\ClientManagement;

/**
 * Kind of a client proposal line item.
 *
 * `scope` is an unpriced deliverable that becomes a ClientTask on acceptance.
 * `add_on` is a priced upsell that becomes an invoice line (one-time) or a
 * ClientAgreementRecurringItem (recurring) on acceptance.
 */
enum ProposalItemKind: string
{
    case Scope = 'scope';
    case AddOn = 'add_on';

    /**
     * Human-readable label.
     */
    public function label(): string
    {
        return match ($this) {
            self::Scope => 'Scope',
            self::AddOn => 'Add-On',
        };
    }

    /**
     * Whether items of this kind carry a price.
     */
    public function isPriced(): bool
    {
        return $this === self::AddOn;
    }

    /**
     * Whether items of this kind become a project task on acceptance.
     */
    public function createsTask(): bool
    {
        return $this === self::Scope;
    }
}
