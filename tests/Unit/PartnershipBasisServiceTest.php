<?php

namespace Tests\Unit;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\PartnershipBasisService;
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

    public function test_liquidation_with_cash_and_property_distributions_computes_liquidation_loss(): void
    {
        $interest = $this->interest('Liquidation LP');
        $this->manualEvent($interest, 2024, 'beginning_basis', 100_00);
        $this->manualEvent($interest, 2024, 'liquidation_distribution_cash', 40_00);
        $this->manualEvent($interest, 2024, 'liquidation_distribution_property', 30_00);

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);
        $this->assertSame(30_00, $basisYear->ending_outside_basis_cents);
        $this->assertSame(-30_00, $basisYear->liquidation_gain_loss_cents);
        $this->assertSame('needs_review', $basisYear->review_status);
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

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     * @param  array<string, mixed>  $basis
     */
    private function basisFromK1(int $year, string $name, array $fields, array $codes, array $basis = [], ?string $ein = null): FinPartnershipBasisYear
    {
        $ein ??= '47-'.str_pad((string) (abs(crc32($name)) % 10_000_000), 7, '0', STR_PAD_LEFT);
        $docFields = ['A' => ['value' => $ein], 'B' => ['value' => $name."\n123 Example Way"], 'D' => ['value' => 'false']];
        foreach ($fields as $box => $value) {
            $docFields[$box] = ['value' => $value];
        }

        $this->k1Document($year, $name, $ein, $docFields, $codes, $basis);
        $this->service->recomputeForUserYear($this->user->id, $year);

        return $this->basisYearFor($name, $year);
    }

    /**
     * @param  array<string, array<string, mixed>>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     * @param  array<string, mixed>  $basis
     */
    private function k1Document(int $year, string $name, string $ein, array $fields, array $codes, array $basis = []): FileForTaxDocument
    {
        if (! isset($fields['A'])) {
            // Union (not array_merge) so numeric box keys such as '5'/'19' are not reindexed.
            $fields += ['A' => ['value' => $ein], 'B' => ['value' => $name], 'D' => ['value' => 'false']];
        }

        $slug = str_replace(' ', '-', strtolower($name));

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
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => $fields,
                'codes' => $codes,
                'basis' => $basis,
            ],
        ]);
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
