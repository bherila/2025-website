<?php

namespace Tests\Unit;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\PartnershipBasisService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PartnershipBasisServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FinAccounts $account;

    private PartnershipBasisService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->actingAs($this->user);
        $this->account = FinAccounts::create(['acct_name' => 'Partnership Account']);
        $this->service = app(PartnershipBasisService::class);
    }

    public function test_initial_contribution_differs_from_initial_capital_account_value(): void
    {
        $basisYear = $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Private Partnership',
            'initial_cash_contribution_cents' => 100_00,
            'initial_tax_basis_capital_cents' => 75_00,
            'initial_book_capital_or_fmv_cents' => 120_00,
            'initialization_review_status' => 'reviewed',
        ]);

        $this->assertSame(100_00, $basisYear->capital_contributions_cents);
        $this->assertSame(0, $basisYear->beginning_outside_basis_cents);
        $this->assertSame(100_00, $basisYear->ending_outside_basis_cents);
        $this->assertSame(75_00, $basisYear->beginning_tax_basis_capital_cents);
        $this->assertSame(120_00, $basisYear->beginning_book_capital_cents);
    }

    public function test_k1_identity_uses_box_a_ein_and_box_b_name(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Identity LP', ['5' => '100'], [], [], '98-7654321');
        $interest = $basisYear->partnershipInterest;

        $this->assertSame('Identity LP', $interest->partnership_name);
        $this->assertSame('987654321', $interest->partnership_ein);
    }

    public function test_taxable_interest_with_zero_partial_and_full_distribution(): void
    {
        $zero = $this->basisFromK1(2024, 'Zero Distribution LP', ['5' => '100'], []);
        $this->assertSame(100_00, $zero->taxable_income_increase_cents);
        $this->assertSame(100_00, $zero->ending_outside_basis_cents);

        $partial = $this->basisFromK1(2024, 'Partial Distribution LP', ['5' => '100'], ['19' => [['code' => 'A', 'value' => '40']]]);
        $this->assertSame(40_00, $partial->cash_distributions_cents);
        $this->assertSame(60_00, $partial->ending_outside_basis_cents);

        $full = $this->basisFromK1(2024, 'Full Distribution LP', ['5' => '100'], ['19' => [['code' => 'A', 'value' => '100']]]);
        $this->assertSame(100_00, $full->cash_distributions_cents);
        $this->assertSame(0, $full->ending_outside_basis_cents);
    }

    public function test_distribution_exceeding_outside_basis_creates_gain_source(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Excess Distribution LP', ['5' => '100'], ['19' => [['code' => 'A', 'value' => '150']]]);

        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(50_00, $basisYear->distribution_gain_cents);
        $this->assertSame('needs_review', $basisYear->review_status);
    }

    public function test_box19_property_distribution_does_not_create_gain(): void
    {
        // A property distribution (Box 19B) reduces basis (floored at zero) but never produces gain.
        $basisYear = $this->basisFromK1(2024, 'Property Distribution LP', ['5' => '100'], ['19' => [['code' => 'B', 'value' => '150']]]);

        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(0, $basisYear->distribution_gain_cents);
        $this->assertSame(150_00, $basisYear->property_distributions_basis_cents);
    }

    public function test_current_box19_distribution_codes_route_to_property_and_liability_types(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Current Box19 LP', [], [
            '19' => [
                ['code' => 'C', 'value' => '30'],
                ['code' => 'G', 'value' => '20'],
                ['code' => 'D', 'value' => '40'],
            ],
        ], [
            'outsideBasisWorksheet' => ['beginningBasis' => 100],
            'liabilities' => ['beginningRecourse' => 100, 'endingRecourse' => 60],
        ]);

        $this->assertSame(50_00, $basisYear->property_distributions_basis_cents);
        $this->assertSame(40_00, $basisYear->liability_decrease_cents);
        $this->assertSame(0, $basisYear->distribution_gain_cents);
        $this->assertSame(10_00, $basisYear->ending_outside_basis_cents);

        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $basisYear->partnership_interest_id,
            'k1_box' => '19',
            'k1_code' => 'D',
            'event_type' => 'deemed_distribution_liability_decrease',
            'amount_cents' => 40_00,
        ]);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $basisYear->partnership_interest_id,
            'source_path' => 'basis.liabilities',
            'event_type' => 'memorandum',
            'amount_cents' => 0,
        ]);
    }

    public function test_box19_distribution_counted_once_when_present_in_normalized_and_codes(): void
    {
        // Same distribution supplied via normalized basis.distributions AND Box 19 codes must
        // only be counted once.
        $basisYear = $this->basisFromK1(2024, 'Dedup Distribution LP', ['5' => '100'], ['19' => [['code' => 'A', 'value' => '40']]], [
            'distributions' => [['box' => '19', 'code' => 'A', 'amount' => 40]],
        ]);

        $this->assertSame(40_00, $basisYear->cash_distributions_cents);
        $this->assertSame(60_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_zero_box19_liability_override_keeps_item_k_liability_decrease_effective(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Zero Box19D Override LP', [], [
            '19' => [
                ['code' => 'D', 'value' => '40'],
            ],
        ], [
            'outsideBasisWorksheet' => ['beginningBasis' => 100],
            'liabilities' => ['beginningRecourse' => 100, 'endingRecourse' => 60],
        ], null, [
            'code:19:D' => ['value' => '0'],
        ]);

        $this->assertSame(40_00, $basisYear->liability_decrease_cents);
        $this->assertSame(60_00, $basisYear->ending_outside_basis_cents);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $basisYear->partnership_interest_id,
            'source_path' => 'basis.liabilities',
            'event_type' => 'liability_decrease',
            'amount_cents' => 40_00,
        ]);
        $this->assertDatabaseMissing('fin_partnership_basis_events', [
            'partnership_interest_id' => $basisYear->partnership_interest_id,
            'k1_box' => '19',
            'k1_code' => 'D',
            'event_type' => 'deemed_distribution_liability_decrease',
        ]);
    }

    public function test_guaranteed_payments_do_not_increase_basis_and_are_not_double_counted(): void
    {
        // Box 5 income increases basis; guaranteed payments (4a/4b/4c) are income to the partner
        // but not a distributive share, so they are memorandum-only and counted once.
        $basisYear = $this->basisFromK1(2024, 'Guaranteed Payment LP', ['5' => '100', '4a' => '50', '4b' => '30', '4c' => '80'], []);

        $this->assertSame(100_00, $basisYear->taxable_income_increase_cents);
        $this->assertSame(100_00, $basisYear->ending_outside_basis_cents);

        $memos = FinPartnershipBasisEvent::query()
            ->where('partnership_interest_id', $basisYear->partnership_interest_id)
            ->where('event_type', 'memorandum')
            ->where('k1_box', '4')
            ->get();
        $this->assertCount(1, $memos);
        $this->assertSame(80_00, (int) $memos->first()->amount_cents);
    }

    public function test_box18_codes_route_to_tax_exempt_income_and_nondeductible_expense(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Box18 LP', ['5' => '100'], [
            '18' => [
                ['code' => 'A', 'value' => '20'],
                ['code' => 'B', 'value' => '5'],
            ],
        ]);

        $this->assertSame(20_00, $basisYear->tax_exempt_income_increase_cents);
        $this->assertSame(5_00, $basisYear->nondeductible_expenses_decrease_cents);
        $this->assertSame(115_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_box21_foreign_taxes_reduce_outside_basis(): void
    {
        // Box 21 foreign taxes paid/accrued are a §705(a)(2)(B) expenditure that reduces outside
        // basis (the same flat field the rest of the app parses for foreign tax).
        $basisYear = $this->basisFromK1(2024, 'Foreign Tax LP', ['5' => '100', '21' => '15'], []);

        $this->assertSame(15_00, $basisYear->foreign_taxes_decrease_cents);
        $this->assertSame(85_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_capital_account_net_income_is_reconciliation_only_and_not_double_counted(): void
    {
        // Box 5 income is authoritative; capitalAccount.currentYearNetIncomeLoss is reconciliation
        // only and must not add a second income amount.
        $basisYear = $this->basisFromK1(2024, 'Capital Account LP', ['5' => '100'], [], [
            'capitalAccount' => ['currentYearNetIncomeLoss' => 100],
        ]);

        $this->assertSame(100_00, $basisYear->taxable_income_increase_cents);
        $this->assertSame(100_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_liability_increase_and_decrease_roll_into_outside_basis(): void
    {
        $increase = $this->basisFromK1(2024, 'Liability Increase LP', [], [], [
            'liabilities' => ['beginningRecourse' => 25, 'endingRecourse' => 125],
        ]);
        $this->assertSame(100_00, $increase->liability_increase_cents);
        $this->assertSame(100_00, $increase->ending_outside_basis_cents);

        $decrease = $this->basisFromK1(2024, 'Liability Decrease LP', [], [], [
            'outsideBasisWorksheet' => ['beginningBasis' => 125],
            'liabilities' => ['beginningRecourse' => 125, 'endingRecourse' => 25],
        ]);
        $this->assertSame(100_00, $decrease->liability_decrease_cents);
        $this->assertSame(25_00, $decrease->ending_outside_basis_cents);
    }

    public function test_k1_re_extraction_updates_amounts_and_prunes_removed_sources(): void
    {
        $document = $this->k1Document(2024, 'Reparse LP', '55-5555555', ['5' => ['value' => '100']], ['19' => [['code' => 'A', 'value' => '40']]]);
        $this->service->recomputeForUserYear($this->user->id, 2024);

        $firstYear = $this->basisYearFor('Reparse LP', 2024);
        $this->assertSame(100_00, $firstYear->taxable_income_increase_cents);
        $this->assertSame(40_00, $firstYear->cash_distributions_cents);

        // Re-extraction: income amount changes and the distribution disappears entirely.
        $document->forceFill(['parsed_data' => [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => ['A' => ['value' => '55-5555555'], 'B' => ['value' => 'Reparse LP'], 'D' => ['value' => 'false'], '5' => ['value' => '120']],
            'codes' => [],
            'basis' => [],
        ]])->save();
        $this->service->recomputeForUserYear($this->user->id, 2024);

        $secondYear = $this->basisYearFor('Reparse LP', 2024);
        $this->assertSame(120_00, $secondYear->taxable_income_increase_cents, 'amount should be refreshed in place');
        $this->assertSame(0, $secondYear->cash_distributions_cents, 'removed source should be pruned, not linger as a ghost');

        $income = FinPartnershipBasisEvent::query()
            ->where('partnership_interest_id', $secondYear->partnership_interest_id)
            ->where('event_type', 'taxable_income')
            ->get();
        $this->assertCount(1, $income, 'income source should be updated, not duplicated');
    }

    public function test_prior_year_rollforward_and_downstream_stale_marking(): void
    {
        $interest = $this->interest('Rollforward LP');
        $this->manualEvent($interest, 2023, 'beginning_basis', 100_00);

        $firstYear = $this->service->recomputeInterestYear($interest, 2023);
        $secondYear = $this->service->recomputeInterestYear($interest, 2024);
        $this->assertSame($firstYear->ending_outside_basis_cents, $secondYear->beginning_outside_basis_cents);

        $this->manualEvent($interest, 2023, 'taxable_income', 25_00);
        $this->service->recomputeInterestYear($interest, 2023);

        $this->assertTrue(FinPartnershipBasisYear::where('id', $secondYear->id)->firstOrFail()->is_stale);
    }

    public function test_carryforward_amount_refreshes_when_prior_year_changes(): void
    {
        $interest = $this->interest('Carryforward Refresh LP');
        $this->manualEvent($interest, 2023, 'beginning_basis', 100_00);
        $this->service->recomputeInterestYear($interest, 2023);
        $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(100_00, $this->service->recomputeInterestYear($interest, 2024)->beginning_outside_basis_cents);

        // Prior year grows; recomputing 2024 must pull the refreshed carryforward, not the stale one.
        $this->manualEvent($interest, 2023, 'taxable_income', 50_00);
        $this->service->recomputeInterestYear($interest, 2023);
        $refreshed = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(150_00, $refreshed->beginning_outside_basis_cents);

        $rollforwardEvents = FinPartnershipBasisEvent::query()
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', 2024)
            ->where('event_type', 'prior_year_rollforward')
            ->get();
        $this->assertCount(1, $rollforwardEvents, 'carryforward marker should be updated in place');
        $this->assertSame(150_00, (int) $rollforwardEvents->first()->amount_cents);
    }

    public function test_reviewed_prior_year_rollforward_preserves_reviewed_status(): void
    {
        $interest = $this->interest('Reviewed Carryforward LP');
        $this->manualEvent($interest, 2023, 'beginning_basis', 100_00);
        $priorYear = $this->service->recomputeInterestYear($interest, 2023);
        $this->assertSame('reviewed', $priorYear->review_status);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame('reviewed', $basisYear->review_status);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
            'event_type' => 'prior_year_rollforward',
            'review_status' => 'reviewed',
        ]);
    }

    public function test_liquidation_with_cash_and_property_distributions_computes_liquidation_loss(): void
    {
        $interest = $this->interest('Liquidation LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'liquidation_distribution_cash', 40_00);
        $this->manualEvent($interest, 2024, 'liquidation_distribution_property', 30_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);
        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(-30_00, $basisYear->liquidation_gain_loss_cents);
        $this->assertSame('needs_review', $basisYear->review_status);

        $nextYear = $this->service->recomputeInterestYear($interest, 2025);
        $this->assertSame(0, $nextYear->beginning_outside_basis_cents);
        $this->assertSame(0, $nextYear->ending_outside_basis_cents);
    }

    public function test_basis_limited_losses_are_suspended(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Loss LP', ['1' => '-150'], []);

        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(150_00, $basisYear->suspended_loss_carryforward_cents);
    }

    public function test_multiple_manual_events_of_same_type_are_not_collapsed(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Manual Multi LP',
            'initial_cash_contribution_cents' => 100_00,
        ]);

        foreach ([10_00, 15_00] as $amount) {
            $this->service->createManualEvent($this->account, $this->user->id, [
                'tax_year' => 2024,
                'event_type' => 'cash_distribution',
                'amount_cents' => $amount,
            ]);
        }

        $distributions = FinPartnershipBasisEvent::query()
            ->where('account_id', $this->account->acct_id)
            ->where('event_type', 'cash_distribution')
            ->get();
        $this->assertCount(2, $distributions, 'each manual distribution is a distinct row');
    }

    public function test_created_manual_event_refreshes_downstream_years(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Manual Downstream LP',
            'initial_cash_contribution_cents' => 100_00,
            'initialization_review_status' => 'reviewed',
        ]);
        $interest = FinPartnershipInterest::query()->where('partnership_name', 'Manual Downstream LP')->firstOrFail();
        $this->service->recomputeInterestYear($interest, 2025);
        $this->assertSame(100_00, $this->basisYearForInterest($interest, 2025)->beginning_outside_basis_cents);

        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_interest_id' => $interest->id,
            'event_type' => 'taxable_income',
            'amount_cents' => 50_00,
            'review_status' => 'reviewed',
        ]);

        $refreshed = $this->basisYearForInterest($interest, 2025);
        $this->assertSame(150_00, $refreshed->beginning_outside_basis_cents);
        $this->assertSame(150_00, $refreshed->ending_outside_basis_cents);
        $this->assertFalse($refreshed->is_stale);
    }

    public function test_locked_year_rejects_new_manual_events(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Locked LP',
            'initial_cash_contribution_cents' => 100_00,
        ]);
        $this->service->lockAccountYear($this->account, $this->user->id, 2024);

        $this->expectException(ValidationException::class);
        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'event_type' => 'cash_distribution',
            'amount_cents' => 10_00,
        ]);
    }

    public function test_lock_records_the_locking_user(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Audit Lock LP',
            'initial_cash_contribution_cents' => 100_00,
        ]);

        $this->service->lockAccountYear($this->account, $this->user->id, 2024);

        $basisYear = FinPartnershipBasisYear::query()->where('tax_year', 2024)->firstOrFail();
        $this->assertSame('locked', $basisYear->review_status);
        $this->assertNotNull($basisYear->locked_at);
        $this->assertSame($this->user->id, (int) $basisYear->locked_by_user_id);
    }

    public function test_unlock_persists_audit_reason_and_user(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Audit Unlock LP',
            'initial_cash_contribution_cents' => 100_00,
        ]);
        $this->service->lockAccountYear($this->account, $this->user->id, 2024);

        $this->service->unlockAccountYear($this->account, $this->user->id, 2024, 'Amended K-1 received', 'Box 1 ordinary income corrected');

        $basisYear = FinPartnershipBasisYear::query()->where('tax_year', 2024)->firstOrFail();
        $this->assertSame('needs_review', $basisYear->review_status);
        $this->assertNull($basisYear->locked_at);
        $this->assertNotNull($basisYear->unlocked_at);
        $this->assertSame($this->user->id, (int) $basisYear->unlocked_by_user_id);
        $this->assertSame('Amended K-1 received', $basisYear->unlock_reason);
        $this->assertSame('Box 1 ordinary income corrected', $basisYear->amendment_reason);
    }

    public function test_manual_event_requires_interest_id_when_account_has_multiple_interests(): void
    {
        $this->basisFromK1(2024, 'First Fund LP', ['5' => '100'], [], [], '11-1111111');
        $this->basisFromK1(2024, 'Second Fund LP', ['5' => '100'], [], [], '22-2222222');

        try {
            $this->service->createManualEvent($this->account, $this->user->id, [
                'tax_year' => 2024,
                'event_type' => 'cash_distribution',
                'amount_cents' => 10_00,
            ]);
            $this->fail('Expected a validation error for an ambiguous interest.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('partnership_interest_id', $e->errors());
        }

        $second = FinPartnershipInterest::where('partnership_name', 'Second Fund LP')->firstOrFail();
        $event = $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'event_type' => 'cash_distribution',
            'amount_cents' => 10_00,
            'partnership_interest_id' => $second->id,
        ]);
        $this->assertSame($second->id, (int) $event->partnership_interest_id);
    }

    public function test_recompute_for_user_year_carries_prior_year_interest_without_current_events(): void
    {
        $interest = $this->interest('Prior Only LP');
        $this->manualEvent($interest, 2023, 'beginning_basis', 100_00);
        $this->service->recomputeForUserYear($this->user->id, 2023);

        $years = $this->service->recomputeForUserYear($this->user->id, 2024);

        $this->assertCount(1, $years);
        $this->assertSame(100_00, $years->first()->beginning_outside_basis_cents);
        $this->assertSame(100_00, $years->first()->ending_outside_basis_cents);
    }

    public function test_suspended_losses_carry_forward_and_release_when_basis_is_restored(): void
    {
        $interest = $this->interest('Suspended Release LP');
        $this->manualEvent($interest, 2023, 'deductible_loss', 150_00);
        $this->service->recomputeInterestYear($interest, 2023);

        $this->manualEvent($interest, 2024, 'capital_contribution_cash', 100_00);
        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(50_00, $basisYear->suspended_loss_carryforward_cents);
        $this->assertSame(100_00, $basisYear->deductions_losses_decrease_cents);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
            'event_type' => 'suspended_loss_released',
            'amount_cents' => 100_00,
            'source_type' => 'carryforward',
        ]);
    }

    public function test_suspended_loss_release_source_status_keeps_year_needing_review(): void
    {
        $interest = $this->interest('Suspended Release Review LP');
        FinPartnershipBasisEvent::create([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2023,
            'event_type' => 'deductible_loss',
            'amount_cents' => 100_00,
            'source_type' => 'manual',
            'review_status' => 'needs_review',
        ]);
        $this->service->recomputeInterestYear($interest, 2023);

        $this->manualEvent($interest, 2024, 'capital_contribution_cash', 100_00);
        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(0, $basisYear->suspended_loss_carryforward_cents);
        $this->assertSame('needs_review', $basisYear->review_status);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
            'event_type' => 'suspended_loss_released',
            'review_status' => 'needs_review',
        ]);
    }

    public function test_prior_tax_and_book_capital_roll_forward_without_current_capital_seed(): void
    {
        $interest = $this->interest('Capital Carry LP');
        $this->manualEvent($interest, 2023, 'initial_tax_basis_capital', 75_00);
        $this->manualEvent($interest, 2023, 'initial_capital_account_value', 120_00);
        $this->service->recomputeInterestYear($interest, 2023);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(75_00, $basisYear->beginning_tax_basis_capital_cents);
        $this->assertSame(75_00, $basisYear->ending_tax_basis_capital_cents);
        $this->assertSame(120_00, $basisYear->beginning_book_capital_cents);
        $this->assertSame(120_00, $basisYear->ending_book_capital_cents);
    }

    public function test_zero_ending_inside_basis_is_preserved(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Inside Zero LP', ['5' => '100'], ['19' => [['code' => 'A', 'value' => '200']]], [
            'capitalAccount' => ['beginningCapital' => 100],
        ]);

        $this->assertSame(0, $basisYear->ending_tax_basis_capital_cents);
        $this->assertSame(0, $basisYear->ending_inside_basis_cents);
    }

    public function test_signed_capital_account_values_are_preserved(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Deficit Capital LP', ['5' => '50'], [], [
            'capitalAccount' => ['beginningCapital' => '-50'],
        ]);

        $this->assertSame(-50_00, $basisYear->beginning_tax_basis_capital_cents);
        $this->assertSame(0, $basisYear->ending_tax_basis_capital_cents);
    }

    public function test_manual_events_default_to_basis_ordering(): void
    {
        $interest = $this->interest('Manual Ordering LP');

        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_interest_id' => $interest->id,
            'event_type' => 'cash_distribution',
            'amount_cents' => 100_00,
        ]);
        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_interest_id' => $interest->id,
            'event_type' => 'taxable_income',
            'amount_cents' => 100_00,
        ]);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);
        $orders = FinPartnershipBasisEvent::query()
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', 2024)
            ->pluck('event_order', 'event_type')
            ->all();

        $this->assertSame(0, $basisYear->distribution_gain_cents);
        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(20, $orders['taxable_income']);
        $this->assertSame(40, $orders['cash_distribution']);
    }

    public function test_manual_basis_increase_and_decrease_are_not_no_ops(): void
    {
        $interest = $this->interest('Manual Basis LP');

        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_interest_id' => $interest->id,
            'event_type' => 'manual_increase_to_outside_basis',
            'amount_cents' => 100_00,
        ]);
        $this->service->createManualEvent($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_interest_id' => $interest->id,
            'event_type' => 'manual_decrease_to_outside_basis',
            'amount_cents' => 25_00,
        ]);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(75_00, $basisYear->ending_outside_basis_cents);
        $this->assertSame(100_00, $basisYear->capital_contributions_cents);
        $this->assertSame(25_00, $basisYear->deductions_losses_decrease_cents);
    }

    public function test_manual_tax_capital_event_moves_tax_capital_and_inside_basis_only(): void
    {
        $interest = $this->interest('Tax Capital LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 200_00);
        $this->manualEvent($interest, 2024, 'initial_tax_basis_capital', 100_00);
        $this->manualEvent($interest, 2024, 'manual_increase_to_tax_capital', 30_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(130_00, $basisYear->ending_tax_basis_capital_cents);
        $this->assertSame(130_00, $basisYear->ending_inside_basis_cents);
        $this->assertSame(200_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_manual_book_capital_event_moves_book_capital_only(): void
    {
        $interest = $this->interest('Book Capital LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 50_00);
        $this->manualEvent($interest, 2024, 'initial_tax_basis_capital', 80_00);
        $this->manualEvent($interest, 2024, 'initial_capital_account_value', 120_00);
        $this->manualEvent($interest, 2024, 'manual_decrease_to_book_capital', 20_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(100_00, $basisYear->ending_book_capital_cents);
        $this->assertSame(80_00, $basisYear->ending_tax_basis_capital_cents);
        $this->assertSame(50_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_manual_outside_basis_adjustment_does_not_change_tax_basis_capital(): void
    {
        // Regression for #945: a manual outside-basis adjustment moves outside basis only and must
        // NOT leak into the tax-basis capital fallback.
        $interest = $this->interest('Outside Only LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'initial_tax_basis_capital', 100_00);
        $this->manualEvent($interest, 2024, 'manual_increase_to_outside_basis', 50_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(150_00, $basisYear->ending_outside_basis_cents);
        $this->assertSame(100_00, $basisYear->ending_tax_basis_capital_cents);
    }

    public function test_manual_tax_capital_adjustment_applies_on_top_of_reported_k1_ending(): void
    {
        // A reported K-1 ending must not swallow a manual capital correction — the manual delta
        // layers on top of the reported ending so the saved event has its advertised effect.
        $interest = $this->interest('Reported Ending LP');
        $this->manualEvent($interest, 2024, 'initial_tax_basis_capital', 100_00);
        FinPartnershipBasisEvent::create([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2024,
            'event_type' => 'memorandum',
            'amount_cents' => 0,
            'source_type' => 'k1_field',
            'review_status' => 'reviewed',
            'metadata' => ['ending_tax_basis_capital_cents' => 90_00],
        ]);
        $this->manualEvent($interest, 2024, 'manual_increase_to_tax_capital', 15_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        // 90_00 reported ending + 15_00 manual increase = 105_00 (not 90_00, and not the 115_00 fallback).
        $this->assertSame(105_00, $basisYear->ending_tax_basis_capital_cents);
    }

    public function test_non_1065_k1_documents_are_skipped(): void
    {
        $document = $this->k1Document(2024, 'S Corp K1 Inc', '11-1111111', [
            'A' => ['value' => '11-1111111'],
            'B' => ['value' => 'S Corp K1 Inc'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], []);
        $parsed = $document->parsed_data;
        $parsed['formType'] = 'K-1-1120S';
        $document->forceFill(['parsed_data' => $parsed])->save();

        $years = $this->service->recomputeForUserYear($this->user->id, 2024);

        $this->assertCount(0, $years);
        $this->assertDatabaseCount('fin_partnership_interests', 0);
    }

    public function test_relinked_k1_prunes_events_from_old_interest(): void
    {
        $document = $this->k1Document(2024, 'Relink LP', '33-3333333', [
            'A' => ['value' => '33-3333333'],
            'B' => ['value' => 'Relink LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], []);
        $this->service->recomputeForUserYear($this->user->id, 2024);
        $oldInterest = FinPartnershipInterest::query()
            ->where('account_id', $this->account->acct_id)
            ->where('partnership_name', 'Relink LP')
            ->firstOrFail();

        $newAccount = FinAccounts::create(['acct_name' => 'Relinked Account']);
        $document->forceFill(['account_id' => $newAccount->acct_id])->save();

        $this->service->recomputeForUserYear($this->user->id, 2024);

        $newInterest = FinPartnershipInterest::query()
            ->where('account_id', $newAccount->acct_id)
            ->where('partnership_name', 'Relink LP')
            ->firstOrFail();
        $oldBasisYear = FinPartnershipBasisYear::query()
            ->where('partnership_interest_id', $oldInterest->id)
            ->where('tax_year', 2024)
            ->firstOrFail();
        $newBasisYear = FinPartnershipBasisYear::query()
            ->where('partnership_interest_id', $newInterest->id)
            ->where('tax_year', 2024)
            ->firstOrFail();

        $this->assertDatabaseMissing('fin_partnership_basis_events', [
            'tax_document_id' => $document->id,
            'partnership_interest_id' => $oldInterest->id,
        ]);
        $this->assertSame(0, $oldBasisYear->ending_outside_basis_cents);
        $this->assertSame(100_00, $newBasisYear->ending_outside_basis_cents);
    }

    public function test_non_1065_correction_prunes_existing_k1_events(): void
    {
        $document = $this->k1Document(2024, 'Corrected Form LP', '44-4444444', [
            'A' => ['value' => '44-4444444'],
            'B' => ['value' => 'Corrected Form LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], []);
        $this->service->recomputeForUserYear($this->user->id, 2024);
        $interest = FinPartnershipInterest::query()->where('partnership_name', 'Corrected Form LP')->firstOrFail();

        $parsed = $document->parsed_data;
        $parsed['formType'] = 'K-1-1120S';
        $document->forceFill(['parsed_data' => $parsed])->save();
        $this->service->recomputeForUserYear($this->user->id, 2024);

        $basisYear = FinPartnershipBasisYear::query()
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', 2024)
            ->firstOrFail();

        $this->assertDatabaseMissing('fin_partnership_basis_events', ['tax_document_id' => $document->id]);
        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
    }

    public function test_deleting_k1_document_removes_its_basis_events(): void
    {
        $document = $this->k1Document(2024, 'Deletable LP', '77-7777777', [
            'A' => ['value' => '77-7777777'],
            'B' => ['value' => 'Deletable LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], ['19' => [['code' => 'A', 'value' => '40']]]);
        $this->service->recomputeForUserYear($this->user->id, 2024);
        $this->assertDatabaseHas('fin_partnership_basis_events', ['tax_document_id' => $document->id]);

        $document->delete();

        // Source events are deleted with their document instead of being orphaned, so a later
        // recompute no longer counts the removed K-1 in outside basis.
        $this->assertDatabaseMissing('fin_partnership_basis_events', ['tax_document_id' => $document->id]);

        $this->service->recomputeForUserYear($this->user->id, 2024);
        $this->assertSame(0, $this->basisYearFor('Deletable LP', 2024)->ending_outside_basis_cents);
    }

    public function test_legacy_k1_data_is_transformed_before_basis_sync(): void
    {
        FileForTaxDocument::create([
            'user_id' => $this->user->id,
            'tax_year' => 2024,
            'form_type' => 'k1',
            'account_id' => $this->account->acct_id,
            'original_filename' => 'legacy-k1.pdf',
            'stored_filename' => 'legacy-k1.pdf',
            'file_size_bytes' => 1,
            'file_hash' => sha1('legacy-k1'),
            'is_reviewed' => true,
            'parsed_data' => [
                'form_source' => 1065,
                'entity_ein' => '66-6666666',
                'entity_name' => 'Legacy LP',
                'box1_ordinary_income' => 100,
                'other_coded_items' => [['code' => '19A', 'amount' => 40, 'description' => 'Cash distribution']],
            ],
        ]);

        $basisYear = $this->service->recomputeForUserYear($this->user->id, 2024)->first();

        $this->assertSame('Legacy LP', $basisYear->partnershipInterest->partnership_name);
        $this->assertSame('666666666', $basisYear->partnershipInterest->partnership_ein);
        $this->assertSame(100_00, $basisYear->taxable_income_increase_cents);
        $this->assertSame(40_00, $basisYear->cash_distributions_cents);
        $this->assertSame(60_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_liability_balances_are_preserved_when_net_change_is_zero(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Flat Liability LP', [], [], [
            'liabilities' => [
                'beginningRecourse' => 50,
                'endingRecourse' => 50,
                'beginningNonrecourse' => 25,
                'endingNonrecourse' => 25,
            ],
        ]);

        $this->assertSame(50_00, $basisYear->beginning_recourse_liability_cents);
        $this->assertSame(50_00, $basisYear->ending_recourse_liability_cents);
        $this->assertSame(25_00, $basisYear->beginning_nonrecourse_liability_cents);
        $this->assertSame(25_00, $basisYear->ending_nonrecourse_liability_cents);
    }

    public function test_empty_normalized_distribution_falls_back_to_box19_codes(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Distribution Fallback LP', ['5' => '100'], [
            '19' => [['code' => 'A', 'value' => '40']],
        ], [
            'distributions' => [['code' => 'A', 'amount' => null, 'partnershipAdjustedBasis' => null]],
        ]);

        $this->assertSame(40_00, $basisYear->cash_distributions_cents);
        $this->assertSame(60_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_non_tax_capital_method_seeds_book_capital_only(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Book Capital LP', [], [], [
            'capitalAccount' => [
                'method' => 'section_704b',
                'beginningCapital' => 100,
                'endingCapital' => 130,
            ],
        ]);

        $this->assertSame(0, $basisYear->beginning_tax_basis_capital_cents);
        $this->assertSame(0, $basisYear->ending_tax_basis_capital_cents);
        $this->assertSame(100_00, $basisYear->beginning_book_capital_cents);
        $this->assertSame(130_00, $basisYear->ending_book_capital_cents);
    }

    public function test_latest_beginning_basis_override_wins(): void
    {
        $interest = $this->interest('Beginning Correction LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'beginning_basis', 200_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(200_00, $basisYear->beginning_outside_basis_cents);
        $this->assertSame(200_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_book_capital_ending_balance_uses_k1_ending_capital(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Ending Book LP', [], [], [
            'capitalAccount' => [
                'method' => 'gaap',
                'beginningCapital' => 100,
                'endingCapital' => 80,
            ],
        ]);

        $this->assertSame(100_00, $basisYear->beginning_book_capital_cents);
        $this->assertSame(80_00, $basisYear->ending_book_capital_cents);
    }

    public function test_holding_period_uses_interest_acquisition_date(): void
    {
        $interest = $this->interest('Holding LP');
        $events = collect();

        $interest->forceFill(['interest_start_date' => '2023-01-01'])->save();
        $this->assertSame('long', $this->service->holdingPeriod($interest->refresh(), 2024, $events));

        // Acquired mid-2024: at 2024 year-end it has been held one year or less → short-term.
        $interest->forceFill(['interest_start_date' => '2024-06-01'])->save();
        $this->assertSame('short', $this->service->holdingPeriod($interest->refresh(), 2024, $events));
    }

    public function test_holding_period_respects_explicit_disposition_date(): void
    {
        $interest = $this->interest('Disposition Date LP');
        $interest->forceFill(['interest_start_date' => '2023-06-01'])->save();
        $events = collect();

        $this->assertSame('short', $this->service->holdingPeriod($interest->refresh(), 2024, $events, CarbonImmutable::parse('2024-03-01')));
        $this->assertSame('long', $this->service->holdingPeriod($interest->refresh(), 2024, $events, CarbonImmutable::parse('2024-12-01')));
    }

    public function test_holding_period_falls_back_to_carryforward_proxy_then_indeterminate(): void
    {
        $interest = $this->interest('Proxy LP');

        // No acquisition date and no prior-year carryforward → first-year, review-only.
        $this->assertSame('indeterminate', $this->service->holdingPeriod($interest, 2024, collect()));

        // A prior-year rollforward proves the interest crossed a year boundary → long-term proxy.
        $rollforward = new FinPartnershipBasisEvent(['event_type' => 'prior_year_rollforward']);
        $this->assertSame('long', $this->service->holdingPeriod($interest, 2024, collect([$rollforward])));
    }

    public function test_section_179_reduces_computed_tax_basis_capital(): void
    {
        // Tax-basis capital method, no explicit ending capital → the fallback rollforward applies.
        // Beginning tax capital 100 + Box 5 income 50 − Box 12 §179 20 = 130.
        $basisYear = $this->basisFromK1(2024, 'Section179 Capital LP', ['5' => '50', '12' => '20'], [], [
            'capitalAccount' => ['method' => 'tax', 'beginningCapital' => 100],
        ]);

        $this->assertSame(130_00, $basisYear->ending_tax_basis_capital_cents);
    }

    public function test_source_value_override_is_applied_to_basis_income(): void
    {
        // A reviewed All-in-One override on Box 1 must drive the rollforward, not the raw extraction.
        $basisYear = $this->basisFromK1(2024, 'Override Income LP', ['1' => '100'], [], [], null, [
            'field:1' => ['value' => '250'],
        ]);

        $this->assertSame(250_00, $basisYear->taxable_income_increase_cents);
        $this->assertSame(250_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_source_value_override_is_applied_to_coded_box(): void
    {
        // Box 13 Code A raw 10, overridden to 40 → deductible loss of 40 against 100 income.
        $basisYear = $this->basisFromK1(2024, 'Override Code LP', ['5' => '100'], [
            '13' => [['code' => 'A', 'value' => '10']],
        ], [], null, ['code:13:A' => ['value' => '40']]);

        $this->assertSame(40_00, $basisYear->deductions_losses_decrease_cents);
        $this->assertSame(60_00, $basisYear->ending_outside_basis_cents);
    }

    public function test_box19_override_is_applied_to_normalized_distribution(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Override Distribution LP', ['5' => '100'], [], [
            'distributions' => [['code' => 'A', 'amount' => '40']],
        ], null, [
            'code:19:A' => ['value' => '60'],
        ]);

        $this->assertSame(60_00, $basisYear->cash_distributions_cents);
        $this->assertSame(40_00, $basisYear->ending_outside_basis_cents);
        $this->assertDatabaseHas('fin_partnership_basis_events', [
            'partnership_interest_id' => $basisYear->partnership_interest_id,
            'source_path' => 'codes.19.A.override',
            'amount_cents' => 60_00,
        ]);
    }

    public function test_manual_interest_merges_with_later_k1_by_name(): void
    {
        // Manual opening basis is seeded before the K-1 arrives → interest with a null EIN.
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Merge LP',
            'initial_cash_contribution_cents' => 100_00,
            'initialization_review_status' => 'reviewed',
        ]);
        $this->assertDatabaseCount('fin_partnership_interests', 1);

        // The K-1 later syncs for the same account+name carrying an EIN.
        $this->k1Document(2024, 'Merge LP', '12-3456789', [
            'A' => ['value' => '12-3456789'],
            'B' => ['value' => 'Merge LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '50'],
        ], []);
        $this->service->recomputeForUserYear($this->user->id, 2024);

        // Still ONE interest — it adopts the EIN and carries both the manual contribution and K-1 income.
        $this->assertDatabaseCount('fin_partnership_interests', 1);
        $interest = FinPartnershipInterest::query()->where('partnership_name', 'Merge LP')->firstOrFail();
        $this->assertSame('123456789', $interest->partnership_ein);
        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2024)->ending_outside_basis_cents);
    }

    public function test_initialize_account_refreshes_existing_downstream_years(): void
    {
        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Initialize Range LP',
            'initial_cash_contribution_cents' => 100_00,
            'initialization_review_status' => 'reviewed',
        ]);
        $interest = FinPartnershipInterest::query()->where('partnership_name', 'Initialize Range LP')->firstOrFail();
        $this->service->recomputeInterestYear($interest, 2025);
        $this->assertSame(100_00, $this->basisYearForInterest($interest, 2025)->ending_outside_basis_cents);

        $this->service->initializeAccount($this->account, $this->user->id, [
            'tax_year' => 2024,
            'partnership_name' => 'Initialize Range LP',
            'initial_cash_contribution_cents' => 150_00,
            'initialization_review_status' => 'reviewed',
        ]);

        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2025)->beginning_outside_basis_cents);
        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2025)->ending_outside_basis_cents);
        $this->assertFalse($this->basisYearForInterest($interest, 2025)->is_stale);
    }

    public function test_k1_recompute_refreshes_existing_downstream_basis_years(): void
    {
        $document = $this->k1Document(2024, 'K-1 Range LP', '12-3456789', [
            'A' => ['value' => '12-3456789'],
            'B' => ['value' => 'K-1 Range LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], []);
        $this->service->recomputeForUserYear($this->user->id, 2024);
        $interest = FinPartnershipInterest::query()->where('partnership_name', 'K-1 Range LP')->firstOrFail();
        $this->service->recomputeInterestYear($interest, 2025);
        $this->assertSame(100_00, $this->basisYearForInterest($interest, 2025)->beginning_outside_basis_cents);

        $parsedData = $document->parsed_data;
        $this->assertIsArray($parsedData);
        $this->assertIsArray($parsedData['fields'] ?? null);
        $this->assertIsArray($parsedData['fields']['5'] ?? null);
        $parsedData['fields']['5']['value'] = '150';
        $document->update(['parsed_data' => $parsedData]);

        $this->service->recomputeForUserYear($this->user->id, 2024);

        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2025)->beginning_outside_basis_cents);
        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2025)->ending_outside_basis_cents);
        $this->assertFalse($this->basisYearForInterest($interest, 2025)->is_stale);
    }

    public function test_sale_exchange_proceeds_produce_disposition_gain(): void
    {
        $interest = $this->interest('Sale LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'sale_exchange', 150_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        // Proceeds 150 − basis 100 = 50 gain, not a −100 loss from ignoring the sale amount.
        $this->assertSame(50_00, $basisYear->liquidation_gain_loss_cents);
        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame('needs_review', $basisYear->review_status);

        $nextYear = $this->service->recomputeInterestYear($interest, 2025);
        $this->assertSame(0, $nextYear->beginning_outside_basis_cents);
        $this->assertSame(0, $nextYear->ending_outside_basis_cents);
    }

    public function test_sale_exchange_below_basis_produces_loss(): void
    {
        $interest = $this->interest('Sale Loss LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'sale_exchange', 60_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(-40_00, $basisYear->liquidation_gain_loss_cents);
    }

    public function test_signed_manual_loss_does_not_inflate_tax_basis_capital(): void
    {
        $interest = $this->interest('Signed Capital LP');
        $this->manualEvent($interest, 2024, 'initial_tax_basis_capital', 100_00);
        // A signed (negative) manual loss reduces capital by its magnitude, not increase it.
        $this->manualEvent($interest, 2024, 'deductible_loss', -100_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);

        $this->assertSame(0, $basisYear->ending_tax_basis_capital_cents);
    }

    public function test_recompute_interest_year_range_refreshes_intervening_and_future_years(): void
    {
        $interest = $this->interest('Span LP');
        $this->manualEvent($interest, 2023, 'beginning_basis', 100_00);
        foreach ([2023, 2024, 2025, 2026] as $rollforwardYear) {
            $this->service->recomputeInterestYear($interest, $rollforwardYear);
        }
        $this->assertSame(100_00, $this->basisYearForInterest($interest, 2026)->ending_outside_basis_cents);

        // Add income in 2024, then recompute the whole span from 2024 forward.
        $this->manualEvent($interest, 2024, 'taxable_income', 50_00);
        $this->service->recomputeInterestYearRange($interest, 2024);

        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2024)->ending_outside_basis_cents);
        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2025)->beginning_outside_basis_cents);
        $this->assertSame(150_00, $this->basisYearForInterest($interest, 2026)->ending_outside_basis_cents);
        $this->assertFalse($this->basisYearForInterest($interest, 2026)->is_stale);
    }

    public function test_recompute_interest_year_range_includes_destination_event_year_without_basis_row(): void
    {
        $interest = $this->interest('Destination Span LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->service->recomputeInterestYear($interest, 2024);
        $this->service->recomputeInterestYear($interest, 2025);
        $this->manualEvent($interest, 2026, 'taxable_income', 25_00);

        $this->service->recomputeInterestYearRange($interest, 2024, 2026);

        $basisYear = $this->basisYearForInterest($interest, 2026);
        $this->assertSame(100_00, $basisYear->beginning_outside_basis_cents);
        $this->assertSame(125_00, $basisYear->ending_outside_basis_cents);
    }

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     * @param  array<string, mixed>  $basis
     */
    private function basisFromK1(int $year, string $name, array $fields, array $codes, array $basis = [], ?string $ein = null, array $overrides = []): FinPartnershipBasisYear
    {
        $ein ??= '47-'.str_pad((string) (abs(crc32($name)) % 10_000_000), 7, '0', STR_PAD_LEFT);
        $docFields = ['A' => ['value' => $ein], 'B' => ['value' => $name."\n123 Example Way"], 'D' => ['value' => 'false']];
        foreach ($fields as $box => $value) {
            $docFields[$box] = ['value' => $value];
        }

        $this->k1Document($year, $name, $ein, $docFields, $codes, $basis, $overrides);
        $this->service->recomputeForUserYear($this->user->id, $year);

        return $this->basisYearFor($name, $year);
    }

    /**
     * @param  array<string, array<string, mixed>>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     * @param  array<string, mixed>  $basis
     * @param  array<string, array<string, mixed>>  $overrides
     */
    private function k1Document(int $year, string $name, string $ein, array $fields, array $codes, array $basis = [], array $overrides = []): FileForTaxDocument
    {
        if (! isset($fields['A'])) {
            // Union (not array_merge) so numeric box keys such as '5'/'19' are not reindexed.
            $fields += ['A' => ['value' => $ein], 'B' => ['value' => $name], 'D' => ['value' => 'false']];
        }

        $slug = str_replace(' ', '-', strtolower($name));

        $parsedData = [
            'schemaVersion' => '2026.1',
            'formType' => 'K-1-1065',
            'fields' => $fields,
            'codes' => $codes,
            'basis' => $basis,
        ];
        if ($overrides !== []) {
            $parsedData['sourceValueOverrides'] = $overrides;
        }

        return FileForTaxDocument::create([
            'user_id' => $this->user->id,
            'tax_year' => $year,
            'form_type' => 'k1',
            'account_id' => $this->account->acct_id,
            'original_filename' => "{$slug}.pdf",
            'stored_filename' => "{$slug}.pdf",
            'file_size_bytes' => 1,
            'file_hash' => sha1($slug.$ein),
            'is_reviewed' => true,
            'parsed_data' => $parsedData,
        ]);
    }

    private function basisYearForInterest(FinPartnershipInterest $interest, int $year): FinPartnershipBasisYear
    {
        return FinPartnershipBasisYear::query()
            ->where('partnership_interest_id', $interest->id)
            ->where('tax_year', $year)
            ->firstOrFail();
    }

    private function basisYearFor(string $name, int $year): FinPartnershipBasisYear
    {
        return FinPartnershipBasisYear::query()
            ->where('user_id', $this->user->id)
            ->where('tax_year', $year)
            ->whereHas('partnershipInterest', fn ($query) => $query->where('partnership_name', $name))
            ->firstOrFail();
    }

    private function interest(string $name): FinPartnershipInterest
    {
        return FinPartnershipInterest::create([
            'user_id' => $this->user->id,
            'account_id' => $this->account->acct_id,
            'partnership_name' => $name,
            'normalized_partnership_name' => strtolower($name),
            'form_type' => 'k1_1065',
        ]);
    }

    private function manualEvent(FinPartnershipInterest $interest, int $year, string $eventType, int $amountCents): void
    {
        FinPartnershipBasisEvent::create([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => $year,
            'event_type' => $eventType,
            'amount_cents' => $amountCents,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);
    }
}
