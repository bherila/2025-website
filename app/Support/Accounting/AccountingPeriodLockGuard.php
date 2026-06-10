<?php

namespace App\Support\Accounting;

/**
 * Abstraction over period/year locks so agent (and future web) writes can ask
 * "may this user edit this domain for this year/account?" without coupling to
 * a specific lock implementation.
 *
 * Only `partnership_basis` is enforced today (backed by
 * fin_partnership_basis_years.locked_at via PartnershipBasisService). The
 * remaining domain constants are reserved attachment points — no lock tables
 * exist for them in this epic, so guards treat them as always editable.
 */
interface AccountingPeriodLockGuard
{
    public const DOMAIN_PARTNERSHIP_BASIS = 'partnership_basis';

    public const DOMAIN_TAX_YEAR = 'tax_year';

    public const DOMAIN_TAX_LOTS = 'tax_lots';

    public const DOMAIN_TRANSACTIONS = 'transactions';

    public const DOMAIN_TAX_PREVIEW_ADJUSTMENTS = 'tax_preview_adjustments';

    /** @var list<string> */
    public const DOMAINS = [
        self::DOMAIN_PARTNERSHIP_BASIS,
        self::DOMAIN_TAX_YEAR,
        self::DOMAIN_TAX_LOTS,
        self::DOMAIN_TRANSACTIONS,
        self::DOMAIN_TAX_PREVIEW_ADJUSTMENTS,
    ];

    /**
     * Assert the given (user, domain, year[, account]) period is editable.
     *
     * @param  array<string, mixed>|null  $context  Domain-specific hints (e.g. the import job context)
     *
     * @throws PeriodLockedException when the period is locked
     * @throws \InvalidArgumentException for unknown domains
     */
    public function assertEditable(int $userId, string $domain, int $year, ?int $accountId = null, ?array $context = null): void;
}
