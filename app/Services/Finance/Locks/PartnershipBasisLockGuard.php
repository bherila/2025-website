<?php

namespace App\Services\Finance\Locks;

use App\Models\FinanceTool\FinPartnershipInterest;
use App\Services\Finance\PartnershipBasisService;
use App\Support\Accounting\AccountingPeriodLockGuard;
use App\Support\Accounting\PeriodLockedException;
use Illuminate\Validation\ValidationException;

/**
 * AccountingPeriodLockGuard backed by the existing partnership-basis year
 * locks. Delegates the actual lock check to
 * PartnershipBasisService::assertYearEditable() so the lock query lives in
 * exactly one place; this class only translates the domain vocabulary
 * (user/domain/year/account) into partnership interests and converts the
 * service's ValidationException into a structured PeriodLockedException.
 *
 * Domains other than partnership_basis have no lock tables in this epic and
 * are treated as always editable (see the TODO tests in
 * AccountingLockGuardTest); unknown domains throw so future callers cannot
 * silently bypass a misspelled domain.
 */
class PartnershipBasisLockGuard implements AccountingPeriodLockGuard
{
    public function __construct(private readonly PartnershipBasisService $basisService) {}

    public function assertEditable(int $userId, string $domain, int $year, ?int $accountId = null, ?array $context = null): void
    {
        if (! in_array($domain, self::DOMAINS, true)) {
            throw new \InvalidArgumentException("Unknown accounting lock domain: {$domain}");
        }

        if ($domain !== self::DOMAIN_PARTNERSHIP_BASIS) {
            return;
        }

        $interests = FinPartnershipInterest::query()
            ->where('user_id', $userId)
            ->when($accountId !== null, fn ($query) => $query->where('account_id', $accountId))
            ->get();

        foreach ($interests as $interest) {
            try {
                $this->basisService->assertYearEditable($interest, $year);
            } catch (ValidationException) {
                throw new PeriodLockedException(self::DOMAIN_PARTNERSHIP_BASIS, $year, $accountId);
            }
        }
    }
}
