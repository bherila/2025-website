<?php

namespace Tests\Unit;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\FinanceTool\FinStatementInvestment;
use App\Models\User;
use App\Services\Finance\PartnershipBasisReconciliationService;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisReconciliationFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisReconciliationFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class PartnershipBasisReconciliationServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FinAccounts $account;

    private PartnershipBasisReconciliationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->actingAs($this->user);
        $this->account = FinAccounts::create([
            'acct_name' => 'Private Fund',
            'acct_capital_commitment' => 500_000.00,
        ]);
        $this->service = app(PartnershipBasisReconciliationService::class);
    }

    public function test_detects_contribution_and_distribution_candidates_and_matching_flag(): void
    {
        $basisYear = $this->basisYear(['cash_distributions_cents' => 40_00]);

        $this->lineItem('2024-02-01', 'Wire', -100.00, 'Capital call #1');
        $this->lineItem('2024-03-01', 'Distribution', -40.00, 'Q1 distribution');
        $this->lineItem('2024-04-01', 'Buy', -25.00, 'Bought shares of something');

        $facts = $this->service->reconcile((int) $this->account->acct_id, 2024, collect([$basisYear]));

        $this->assertTrue($facts->hasReconcilableData);
        $this->assertCount(1, $facts->contributionCandidates);
        $this->assertSame(100.0, $facts->contributionCandidates[0]->amount);
        $this->assertSame('capital_contribution_cash', $facts->contributionCandidates[0]->suggestedEventType);

        $this->assertCount(1, $facts->distributionCandidates);
        $this->assertSame(40.0, $facts->distributionCandidates[0]->amount);
        $this->assertSame('cash_distribution', $facts->distributionCandidates[0]->suggestedEventType);

        $mismatch = $this->flag($facts, 'k1_distributions_vs_account_withdrawals');
        $this->assertSame('match', $mismatch->status);
        $this->assertSame(40.0, $mismatch->expected);
        $this->assertSame(40.0, $mismatch->observed);
    }

    public function test_flags_distribution_mismatch_between_k1_and_account(): void
    {
        $basisYear = $this->basisYear(['cash_distributions_cents' => 90_00]);
        $this->lineItem('2024-03-01', 'Distribution', -40.00, 'Partial distribution');

        $facts = $this->service->reconcile((int) $this->account->acct_id, 2024, collect([$basisYear]));

        $mismatch = $this->flag($facts, 'k1_distributions_vs_account_withdrawals');
        $this->assertSame('mismatch', $mismatch->status);
        $this->assertSame(90.0, $mismatch->expected);
        $this->assertSame(40.0, $mismatch->observed);
        $this->assertSame(-50.0, $mismatch->difference);
    }

    public function test_statement_nav_and_cost_basis_become_info_flags(): void
    {
        $basisYear = $this->basisYear([
            'ending_book_capital_cents' => 900_00,
            'ending_inside_basis_cents' => 750_00,
        ]);

        FinStatementInvestment::create([
            'user_id' => $this->user->id,
            'account_id' => $this->account->acct_id,
            'as_of_date' => '2024-12-31',
            'investment_name' => 'Private Fund LP',
            'fair_value' => 1_000.00,
            'cost_basis' => 800.00,
        ]);

        $facts = $this->service->reconcile((int) $this->account->acct_id, 2024, collect([$basisYear]));

        $nav = $this->flag($facts, 'statement_nav_vs_book_capital');
        $this->assertSame('info', $nav->status);
        $this->assertSame(900.0, $nav->expected);
        $this->assertSame(1_000.0, $nav->observed);

        $insideProxy = $this->flag($facts, 'statement_cost_basis_vs_inside_basis');
        $this->assertSame('info', $insideProxy->status);
        $this->assertSame(750.0, $insideProxy->expected);
        $this->assertSame(800.0, $insideProxy->observed);
    }

    public function test_capital_commitment_flag_compares_committed_to_called(): void
    {
        $basisYear = $this->basisYear([]);
        $this->lineItem('2024-02-01', 'Wire', -150.00, 'Capital call');

        $facts = $this->service->reconcile((int) $this->account->acct_id, 2024, collect([$basisYear]));

        $commitment = $this->flag($facts, 'capital_commitment');
        $this->assertSame('info', $commitment->status);
        $this->assertSame(500_000.0, $commitment->expected);
        $this->assertSame(150.0, $commitment->observed);
    }

    public function test_account_with_no_activity_has_no_reconcilable_data(): void
    {
        $facts = $this->service->reconcile((int) $this->account->acct_id, 2024, new Collection);

        // Only the capital-commitment info flag (from the account) is present, so candidates are empty.
        $this->assertCount(0, $facts->contributionCandidates);
        $this->assertCount(0, $facts->distributionCandidates);
    }

    /**
     * @param  array<string, int>  $attributes
     */
    private function basisYear(array $attributes): FinPartnershipBasisYear
    {
        $interest = FinPartnershipInterest::create([
            'user_id' => $this->user->id,
            'account_id' => $this->account->acct_id,
            'partnership_name' => 'Private Fund LP',
            'normalized_partnership_name' => 'private fund lp',
            'form_type' => 'k1_1065',
        ]);

        return FinPartnershipBasisYear::create(array_merge([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
        ], $attributes));
    }

    private function lineItem(string $date, string $type, float $amount, string $description): void
    {
        FinAccountLineItems::create([
            't_account' => $this->account->acct_id,
            't_date' => $date,
            't_type' => $type,
            't_amt' => $amount,
            't_description' => $description,
        ]);
    }

    private function flag(PartnershipBasisReconciliationFacts $facts, string $key): PartnershipBasisReconciliationFlag
    {
        foreach ($facts->flags as $flag) {
            if ($flag->key === $key) {
                return $flag;
            }
        }

        $this->fail("Missing reconciliation flag [{$key}].");
    }
}
