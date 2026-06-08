<?php

namespace App\Services\Finance;

use App\Enums\Finance\PartnershipBasisEventType;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinStatement;
use App\Models\FinanceTool\FinStatementInvestment;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisReconciliationFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisReconciliationFlag;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisReconciliationItem;

/**
 * Reconciles a partnership account's transactions and statements against the computed basis
 * rollforward. Output is read-only: capital-call/withdrawal candidates and comparison flags the
 * partner reviews. It never creates basis-affecting events or adjusts outside basis — statement
 * NAV is book/FMV reconciliation only and statement cost basis is an inside-basis proxy candidate.
 */
class PartnershipBasisReconciliationService
{
    /** Transaction type/description keywords that suggest a contribution (capital call) to the partnership. */
    private const CONTRIBUTION_KEYWORDS = ['capital call', 'capital contribution', 'contribution', 'subscription', 'drawdown', 'commitment'];

    /** Transaction type/description keywords that suggest a distribution/withdrawal from the partnership. */
    private const DISTRIBUTION_KEYWORDS = ['distribution', 'redemption', 'redeem', 'return of capital', 'withdrawal'];

    /** Dollar tolerance below which a comparison is treated as a match rather than a mismatch. */
    private const MATCH_TOLERANCE = 1.0;

    /**
     * @param  iterable<FinPartnershipBasisYear>  $basisYears  All basis years for this account/year.
     */
    public function reconcile(int $accountId, int $year, iterable $basisYears): PartnershipBasisReconciliationFacts
    {
        $expectedCashDistributionsCents = 0;
        $endingBookCapitalCents = 0;
        $endingInsideBasisCents = null;
        foreach ($basisYears as $basisYear) {
            $expectedCashDistributionsCents += (int) $basisYear->cash_distributions_cents;
            $endingBookCapitalCents += (int) $basisYear->ending_book_capital_cents;
            if ($basisYear->ending_inside_basis_cents !== null) {
                $endingInsideBasisCents = ($endingInsideBasisCents ?? 0) + (int) $basisYear->ending_inside_basis_cents;
            }
        }

        [$contributionCandidates, $distributionCandidates, $observedDistributions, $observedContributions] = $this->transactionCandidates($accountId, $year);

        $flags = [];
        $this->pushCapitalCommitmentFlag($flags, $accountId, $observedContributions);
        $this->pushDistributionMismatchFlag($flags, $expectedCashDistributionsCents, $observedDistributions);
        $this->pushStatementFlags($flags, $accountId, $year, $endingBookCapitalCents, $endingInsideBasisCents);

        $hasData = $contributionCandidates !== [] || $distributionCandidates !== [] || $flags !== [];

        return new PartnershipBasisReconciliationFacts(
            accountId: $accountId,
            year: $year,
            contributionCandidates: $contributionCandidates,
            distributionCandidates: $distributionCandidates,
            flags: $flags,
            hasReconcilableData: $hasData,
        );
    }

    /**
     * @return array{0: PartnershipBasisReconciliationItem[], 1: PartnershipBasisReconciliationItem[], 2: float, 3: float}
     */
    private function transactionCandidates(int $accountId, int $year): array
    {
        $rows = FinAccountLineItems::query()
            ->where('t_account', $accountId)
            ->where('t_date', '>=', "{$year}-01-01")
            ->where('t_date', '<', ($year + 1).'-01-01')
            ->orderBy('t_date')
            ->orderBy('t_id')
            ->get();

        $contributions = [];
        $distributions = [];
        $observedDistributions = 0.0;
        $observedContributions = 0.0;

        foreach ($rows as $row) {
            $amount = abs((float) ($row->t_amt ?? 0.0));
            if ($amount === 0.0) {
                continue;
            }

            $haystack = strtolower(trim(implode(' ', array_filter([
                (string) $row->t_type,
                (string) $row->t_description,
                (string) $row->t_comment,
            ]))));

            // Distribution keywords take precedence so an explicit "distribution" is never misread
            // as a contribution by the generic "contribution" substring.
            if ($this->matchesAny($haystack, self::DISTRIBUTION_KEYWORDS)) {
                $distributions[] = $this->lineItemCandidate($row, 'distribution', PartnershipBasisEventType::CashDistribution->value, $amount);
                $observedDistributions = MoneyMath::sum([$observedDistributions, $amount]);
            } elseif ($this->matchesAny($haystack, self::CONTRIBUTION_KEYWORDS)) {
                $contributions[] = $this->lineItemCandidate($row, 'contribution', PartnershipBasisEventType::CapitalContributionCash->value, $amount);
                $observedContributions = MoneyMath::sum([$observedContributions, $amount]);
            }
        }

        return [$contributions, $distributions, MoneyMath::round($observedDistributions), MoneyMath::round($observedContributions)];
    }

    /**
     * Surface the fund's total capital commitment (when recorded on the account) alongside the
     * capital calls observed in the account this year, so the partner can track called vs committed
     * capital. Informational only — commitments never adjust outside basis.
     *
     * @param  PartnershipBasisReconciliationFlag[]  $flags
     */
    private function pushCapitalCommitmentFlag(array &$flags, int $accountId, float $observedContributions): void
    {
        $account = FinAccounts::withoutGlobalScopes()->find($accountId);
        $commitment = $account?->acct_capital_commitment;
        if ($commitment === null) {
            return;
        }

        $committed = MoneyMath::round((float) $commitment);
        if ($committed === 0.0) {
            return;
        }

        $flags[] = new PartnershipBasisReconciliationFlag(
            key: 'capital_commitment',
            label: 'Total capital commitment vs capital called this year',
            status: PartnershipBasisReconciliationFlag::STATUS_INFO,
            expected: $committed,
            observed: $observedContributions,
            difference: MoneyMath::subtract($committed, $observedContributions),
            detail: 'Total committed capital recorded on the account; compare cumulative capital calls against this commitment.',
        );
    }

    private function lineItemCandidate(FinAccountLineItems $row, string $kind, string $suggestedEventType, float $amount): PartnershipBasisReconciliationItem
    {
        return new PartnershipBasisReconciliationItem(
            id: "line-item-{$row->t_id}",
            kind: $kind,
            date: substr((string) $row->t_date, 0, 10),
            description: $this->candidateDescription($row),
            amount: MoneyMath::round($amount),
            suggestedEventType: $suggestedEventType,
            lineItemId: (int) $row->t_id,
            statementId: $row->statement_id !== null ? (int) $row->statement_id : null,
            statementInvestmentId: null,
        );
    }

    private function candidateDescription(FinAccountLineItems $row): ?string
    {
        foreach ([$row->t_description, $row->t_type, $row->t_comment] as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /**
     * @param  PartnershipBasisReconciliationFlag[]  $flags
     */
    private function pushDistributionMismatchFlag(array &$flags, int $expectedCashDistributionsCents, float $observedDistributions): void
    {
        $expected = MoneyMath::fromCents($expectedCashDistributionsCents);
        if ($expected === 0.0 && $observedDistributions === 0.0) {
            return;
        }

        $difference = MoneyMath::subtract($observedDistributions, $expected);
        $status = abs($difference) <= self::MATCH_TOLERANCE
            ? PartnershipBasisReconciliationFlag::STATUS_MATCH
            : PartnershipBasisReconciliationFlag::STATUS_MISMATCH;

        $flags[] = new PartnershipBasisReconciliationFlag(
            key: 'k1_distributions_vs_account_withdrawals',
            label: 'K-1 Box 19 distributions vs account withdrawals',
            status: $status,
            expected: $expected,
            observed: $observedDistributions,
            difference: $difference,
            detail: $status === PartnershipBasisReconciliationFlag::STATUS_MATCH
                ? 'Recorded distributions agree with account withdrawal activity.'
                : 'Recorded distributions differ from account withdrawal activity; reconcile the K-1 Box 19 amount against the account.',
        );
    }

    /**
     * @param  PartnershipBasisReconciliationFlag[]  $flags
     */
    private function pushStatementFlags(array &$flags, int $accountId, int $year, int $endingBookCapitalCents, ?int $endingInsideBasisCents): void
    {
        $investment = $this->latestStatementInvestment($accountId, $year);
        $statement = $this->latestStatement($accountId, $year);

        $fairValue = $investment instanceof FinStatementInvestment && $investment->fair_value !== null
            ? MoneyMath::round((float) $investment->fair_value)
            : ($statement instanceof FinStatement ? $this->parseMoney($statement->balance) : null);

        if ($fairValue !== null) {
            $book = MoneyMath::fromCents($endingBookCapitalCents);
            $flags[] = new PartnershipBasisReconciliationFlag(
                key: 'statement_nav_vs_book_capital',
                label: 'Statement NAV / fair value vs ending book capital',
                status: PartnershipBasisReconciliationFlag::STATUS_INFO,
                expected: $book,
                observed: $fairValue,
                difference: MoneyMath::subtract($fairValue, $book),
                detail: 'Reconciliation only — statement NAV / fair value is book/FMV capital and is never used as outside basis.',
            );
        }

        $costBasis = $investment instanceof FinStatementInvestment && $investment->cost_basis !== null
            ? MoneyMath::round((float) $investment->cost_basis)
            : ($statement instanceof FinStatement ? $this->parseMoney($statement->cost_basis) : null);

        if ($costBasis !== null) {
            $inside = $endingInsideBasisCents !== null ? MoneyMath::fromCents($endingInsideBasisCents) : 0.0;
            $flags[] = new PartnershipBasisReconciliationFlag(
                key: 'statement_cost_basis_vs_inside_basis',
                label: 'Statement cost basis vs inside-basis proxy',
                status: PartnershipBasisReconciliationFlag::STATUS_INFO,
                expected: $inside,
                observed: $costBasis,
                difference: MoneyMath::subtract($costBasis, $inside),
                detail: $endingInsideBasisCents !== null
                    ? 'Candidate inside-basis proxy — statement cost basis never adjusts outside basis without review.'
                    : 'No inside-basis figure is recorded; statement cost basis is a candidate inside-basis proxy and never adjusts outside basis without review.',
            );
        }
    }

    private function latestStatementInvestment(int $accountId, int $year): ?FinStatementInvestment
    {
        return FinStatementInvestment::query()
            ->where('account_id', $accountId)
            ->where('as_of_date', '>=', "{$year}-01-01")
            ->where('as_of_date', '<', ($year + 1).'-01-01')
            ->orderBy('as_of_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();
    }

    private function latestStatement(int $accountId, int $year): ?FinStatement
    {
        return FinStatement::query()
            ->where('acct_id', $accountId)
            ->where('statement_closing_date', '>=', "{$year}-01-01")
            ->where('statement_closing_date', '<', ($year + 1).'-01-01')
            ->orderBy('statement_closing_date', 'desc')
            ->orderBy('statement_id', 'desc')
            ->first();
    }

    /**
     * @param  string[]  $keywords
     */
    private function matchesAny(string $haystack, array $keywords): bool
    {
        foreach ($keywords as $keyword) {
            if (str_contains($haystack, $keyword)) {
                return true;
            }
        }

        return false;
    }

    private function parseMoney(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return MoneyMath::round((float) $value);
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = str_replace([',', '$'], '', trim($value));
        if (! is_numeric($normalized)) {
            return null;
        }

        return MoneyMath::round((float) $normalized);
    }
}
