<?php

namespace Tests\Feature;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisEvent;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\PartnershipBasisService;
use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxPreviewWorkbookBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnershipBasisApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_basis_endpoint_and_tax_preview_facts_include_partnership_basis(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Basis Account']);

        FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2024,
            'form_type' => 'k1',
            'account_id' => $account->acct_id,
            'original_filename' => 'basis.pdf',
            'stored_filename' => 'basis.pdf',
            'file_size_bytes' => 1,
            'file_hash' => sha1('basis-api'),
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => [
                    // Box A = EIN, Box B = name/address, Box D = PTP flag.
                    'A' => ['value' => '12-3456789'],
                    'B' => ['value' => "Basis API LP\n123 Example Way"],
                    'D' => ['value' => 'false'],
                    '5' => ['value' => '100'],
                ],
                'codes' => ['19' => [['code' => 'A', 'value' => '40']]],
                'basis' => ['capitalAccount' => ['beginningCapital' => 75]],
            ],
        ]);

        // Sync is an explicit action; reads never mutate basis state.
        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/recompute?year=2024")->assertOk();

        $this->getJson("/api/finance/accounts/{$account->acct_id}/basis?year=2024")
            ->assertOk()
            ->assertJsonPath('interests.0.partnershipName', 'Basis API LP')
            ->assertJsonPath('interests.0.partnershipEin', '123456789')
            ->assertJsonPath('interests.0.endingOutsideBasis', 60);

        $this->getJson('/api/finance/tax-preview-data?year=2024&include_tax_facts=1')
            ->assertOk()
            ->assertJsonPath('taxFacts.partnershipBasis.interestCount', 1)
            ->assertJsonPath('taxFacts.partnershipBasis.interests.0.worksheet.cashDistributions', 40);
    }

    public function test_excess_cash_distribution_gain_flows_to_schedule_d_line_10_when_long_term(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Disposition Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_ein' => '900000001',
            'partnership_name' => 'Disposition LP',
            'normalized_partnership_name' => 'disposition lp',
            'form_type' => 'k1_1065',
        ]);

        // 2023 seeds basis; 2024 distributes far in excess → long-term gain on the interest.
        $this->event($user->id, $interest->id, 2023, 'beginning_basis', 50_00, 'reviewed');
        $this->event($user->id, $interest->id, 2024, 'cash_distribution', 90_00, 'reviewed');

        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2023);
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024);

        // The excess distribution gain (90 − 50 = 40) is surfaced as a reviewable basis gain source…
        $gainSources = $facts['partnershipBasis']['distributionGainSources'];
        $this->assertCount(1, $gainSources);
        $this->assertSame(40.0, $gainSources[0]['amount']);
        $this->assertSame('needs_review', $gainSources[0]['reviewStatus']);

        // …and, because the interest was held over a year, the §731 gain is treated as a
        // sale of the interest on Form 8949 Part II (box F) and flows to Schedule D line 10.
        $line10 = collect($facts['scheduleD']['line10Sources'])
            ->firstWhere('sourceType', 'partnership_excess_distribution_gain');
        $this->assertNotNull($line10, 'excess distribution gain should appear on Schedule D line 10');
        $this->assertSame(40.0, $line10['amount']);
        $this->assertSame(40.0, $facts['scheduleD']['line10GainLoss']);
        $this->assertSame('schedule_d_line_10', $line10['routing']);

        // It is never routed to line 12 (which is reserved for K-1 pass-through gains).
        $this->assertEmpty(collect($facts['scheduleD']['line12Sources'])
            ->where('sourceType', 'partnership_excess_distribution_gain'));

        // The same gain is generated as a Form 8949 long-term (box F) disposition row.
        $row = collect($facts['form8949']['rows'])
            ->firstWhere('form8949Box', 'F');
        $this->assertNotNull($row, 'a Form 8949 box F disposition row should be generated');
        $this->assertSame(40.0, $row['gainOrLoss']);
        $this->assertSame(40.0, $row['proceeds']);
        $this->assertSame(0.0, $row['costBasis']);
        $this->assertFalse($row['isShortTerm']);
    }

    public function test_excess_distribution_gain_routes_to_schedule_d_line_3_when_short_term(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Short Disposition Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_ein' => '900000002',
            'partnership_name' => 'Short Hold LP',
            'normalized_partnership_name' => 'short hold lp',
            'form_type' => 'k1_1065',
            // Acquired in 2024 → held one year or less at year-end → short-term §731 gain.
            'interest_start_date' => '2024-02-01',
        ]);

        $this->event($user->id, $interest->id, 2024, 'beginning_basis', 50_00, 'reviewed');
        $this->event($user->id, $interest->id, 2024, 'cash_distribution', 90_00, 'reviewed');
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024);

        $line3 = collect($facts['scheduleD']['line3Sources'])
            ->firstWhere('sourceType', 'partnership_excess_distribution_gain');
        $this->assertNotNull($line3, 'short-term excess distribution gain should appear on Schedule D line 3');
        $this->assertSame(40.0, $line3['amount']);
        $this->assertSame(40.0, $facts['scheduleD']['line3GainLoss']);

        $row = collect($facts['form8949']['rows'])->firstWhere('form8949Box', 'C');
        $this->assertNotNull($row, 'a Form 8949 box C disposition row should be generated');
        $this->assertTrue($row['isShortTerm']);
        $this->assertSame(40.0, $row['gainOrLoss']);
    }

    public function test_first_year_excess_distribution_gain_stays_review_only(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Indeterminate Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Indeterminate LP',
            'normalized_partnership_name' => 'indeterminate lp',
            'form_type' => 'k1_1065',
        ]);

        // No acquisition date and no prior year → holding period indeterminate.
        $this->event($user->id, $interest->id, 2024, 'beginning_basis', 50_00, 'reviewed');
        $this->event($user->id, $interest->id, 2024, 'cash_distribution', 90_00, 'reviewed');
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024);

        // Surfaced for review, but never summed into Schedule D and never a Form 8949 row.
        $gainSources = collect($facts['partnershipBasis']['distributionGainSources'])
            ->where('sourceType', 'partnership_excess_distribution_gain');
        $this->assertCount(1, $gainSources);
        $this->assertSame('needs_review_schedule_d_line_5_or_12', $gainSources->first()['routing']);
        $this->assertSame(0.0, $facts['scheduleD']['line3GainLoss']);
        $this->assertSame(0.0, $facts['scheduleD']['line10GainLoss']);
        $this->assertEmpty($facts['partnershipBasis']['form8949Rows']);
    }

    public function test_property_distribution_date_does_not_extend_holding_period_of_cash_gain(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Dating Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Dating LP',
            'normalized_partnership_name' => 'dating lp',
            'form_type' => 'k1_1065',
            'interest_start_date' => '2023-12-01',
        ]);

        // Cash distribution (creates the §731 gain) is dated before the one-year mark; a later
        // property distribution is dated after it. The gain's holding period must follow the cash
        // distribution date (short-term), not the later property date.
        $this->datedEvent($user->id, $interest->id, 2024, 'beginning_basis', 30_00, null);
        $this->datedEvent($user->id, $interest->id, 2024, 'cash_distribution', 50_00, '2024-11-15');
        $this->datedEvent($user->id, $interest->id, 2024, 'property_distribution_basis', 10_00, '2024-12-20');
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2024);

        $gain = collect($facts['partnershipBasis']['distributionGainSources'])
            ->firstWhere('sourceType', 'partnership_excess_distribution_gain');
        $this->assertNotNull($gain);
        $this->assertSame(20.0, $gain['amount']);
        $this->assertSame('schedule_d_line_3', $gain['routing']);
        $this->assertSame(20.0, $facts['scheduleD']['line3GainLoss']);
    }

    public function test_update_interest_endpoint_sets_holding_period_inputs(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Interest Update Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Update Interest LP',
            'normalized_partnership_name' => 'update interest lp',
            'form_type' => 'k1_1065',
        ]);

        $this->putJson("/api/finance/accounts/{$account->acct_id}/basis/interests/{$interest->id}", [
            'interest_start_date' => '2022-05-01',
            'is_trader_fund' => true,
        ])->assertOk()
            ->assertJsonPath('interestStartDate', '2022-05-01')
            ->assertJsonPath('isTraderFund', true);

        $interest->refresh();
        $this->assertSame('2022-05-01', $interest->interest_start_date?->toDateString());
        $this->assertTrue((bool) $interest->is_trader_fund);
    }

    public function test_show_endpoint_includes_reconciliation_candidates(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Reconcile Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Reconcile LP',
            'normalized_partnership_name' => 'reconcile lp',
            'form_type' => 'k1_1065',
        ]);
        $this->event($user->id, $interest->id, 2024, 'beginning_basis', 100_00, 'reviewed');
        app(PartnershipBasisService::class)->recomputeInterestYear($interest, 2024);

        FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2024-03-01',
            't_type' => 'Distribution',
            't_amt' => -25.00,
            't_description' => 'Cash distribution',
        ]);

        $this->getJson("/api/finance/accounts/{$account->acct_id}/basis?year=2024")
            ->assertOk()
            ->assertJsonPath('reconciliation.hasReconcilableData', true)
            ->assertJsonPath('reconciliation.distributionCandidates.0.amount', 25)
            ->assertJsonPath('reconciliation.distributionCandidates.0.suggestedEventType', 'cash_distribution');
    }

    public function test_initialization_and_manual_event_endpoints_preserve_source_review_state(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Manual Basis Account']);

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/initialization", [
            'tax_year' => 2024,
            'partnership_name' => 'Manual LP',
            'initial_cash_contribution_cents' => 100_00,
            'initial_tax_basis_capital_cents' => 60_00,
            'initialization_review_status' => 'needs_review',
        ])->assertCreated()
            ->assertJsonPath('events.0.reviewStatus', 'needs_review');

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/events", [
            'tax_year' => 2024,
            'event_type' => 'taxable_income',
            'amount_cents' => 25_00,
            'review_status' => 'reviewed',
            'source_label' => 'Manual income allocation',
        ])->assertCreated()
            ->assertJsonPath('sourceLabel', 'Manual income allocation');

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/lock?year=2024")
            ->assertOk()
            ->assertJsonPath('interests.0.reviewStatus', 'locked');
    }

    public function test_event_update_cannot_reassign_partnership_interest(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Update Account']);
        $first = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'First Update LP',
            'normalized_partnership_name' => 'first update lp',
            'form_type' => 'k1_1065',
        ]);
        $second = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Second Update LP',
            'normalized_partnership_name' => 'second update lp',
            'form_type' => 'k1_1065',
        ]);
        $event = FinPartnershipBasisEvent::create([
            'user_id' => $user->id,
            'partnership_interest_id' => $first->id,
            'account_id' => $account->acct_id,
            'tax_year' => 2024,
            'event_type' => 'taxable_income',
            'amount_cents' => 10_00,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);

        $this->putJson("/api/finance/accounts/{$account->acct_id}/basis/events/{$event->id}", [
            'partnership_interest_id' => $second->id,
            'amount_cents' => 25_00,
        ])->assertOk();

        $event->refresh();
        $this->assertSame($first->id, (int) $event->partnership_interest_id);
        $this->assertSame(25_00, (int) $event->amount_cents);
    }

    public function test_event_update_reseats_order_when_type_changes(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Reorder Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Reorder LP',
            'normalized_partnership_name' => 'reorder lp',
            'form_type' => 'k1_1065',
        ]);
        $event = FinPartnershipBasisEvent::create([
            'user_id' => $user->id,
            'partnership_interest_id' => $interest->id,
            'account_id' => $account->acct_id,
            'tax_year' => 2024,
            'event_type' => 'cash_distribution',
            'event_order' => 40,
            'amount_cents' => 10_00,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);

        // Correcting the type to income (without sending event_order) must re-seat the row at the
        // income slot so the rollforward applies it before same-year distributions.
        $this->putJson("/api/finance/accounts/{$account->acct_id}/basis/events/{$event->id}", [
            'event_type' => 'taxable_income',
            'amount_cents' => 50_00,
        ])->assertOk()->assertJsonPath('eventOrder', 20);

        $this->assertSame(20, (int) $event->refresh()->event_order);
    }

    public function test_lock_endpoint_locks_every_basis_year_for_account(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Multi Lock Account']);

        foreach (['First Lock LP', 'Second Lock LP'] as $name) {
            $interest = FinPartnershipInterest::create([
                'user_id' => $user->id,
                'account_id' => $account->acct_id,
                'partnership_name' => $name,
                'normalized_partnership_name' => strtolower($name),
                'form_type' => 'k1_1065',
            ]);
            $this->event($user->id, $interest->id, 2024, 'beginning_basis', 100_00, 'reviewed');
            app(PartnershipBasisService::class)->recomputeInterestYear($interest, 2024);
        }

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/lock?year=2024")
            ->assertOk()
            ->assertJsonCount(2, 'interests')
            ->assertJsonPath('interests.0.reviewStatus', 'locked')
            ->assertJsonPath('interests.1.reviewStatus', 'locked');
    }

    public function test_unlock_endpoint_reopens_a_locked_year(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Unlock Account']);

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/initialization", [
            'tax_year' => 2024,
            'partnership_name' => 'Unlock LP',
            'initial_cash_contribution_cents' => 100_00,
        ])->assertCreated();

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/lock?year=2024")
            ->assertOk()
            ->assertJsonPath('interests.0.reviewStatus', 'locked');

        // Locked years reject new events.
        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/events", [
            'tax_year' => 2024,
            'event_type' => 'cash_distribution',
            'amount_cents' => 10_00,
        ])->assertStatus(422);

        // Unlocking reopens the rollforward for amendment.
        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/unlock?year=2024")
            ->assertOk()
            ->assertJsonPath('interests.0.reviewStatus', 'needs_review')
            ->assertJsonPath('interests.0.lockedAt', null);

        // The year is editable again.
        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/events", [
            'tax_year' => 2024,
            'event_type' => 'cash_distribution',
            'amount_cents' => 10_00,
        ])->assertCreated();
    }

    public function test_unknown_event_type_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Validation Account']);
        FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Validation LP',
            'normalized_partnership_name' => 'validation lp',
            'form_type' => 'k1_1065',
        ]);

        $this->postJson("/api/finance/accounts/{$account->acct_id}/basis/events", [
            'tax_year' => 2024,
            'event_type' => 'not_a_real_event_type',
            'amount_cents' => 10_00,
        ])->assertStatus(422)->assertJsonValidationErrors('event_type');
    }

    public function test_workbook_export_includes_partnership_basis_worksheets(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Workbook Basis Account']);
        $interest = FinPartnershipInterest::create([
            'user_id' => $user->id,
            'account_id' => $account->acct_id,
            'partnership_name' => 'Workbook LP',
            'normalized_partnership_name' => 'workbook lp',
            'form_type' => 'k1_1065',
        ]);
        $this->event($user->id, $interest->id, 2024, 'beginning_basis', 100_00, 'reviewed');
        app(PartnershipBasisService::class)->recomputeForUserYear($user->id, 2024);

        $workbook = app(TaxPreviewWorkbookBuilder::class)->buildForUserYear($user->id, 2024);
        $names = array_column($workbook['sheets'], 'name');

        $this->assertContains('Partnership Basis Summary', $names);
        $this->assertContains('Outside Basis Rollforward', $names);
        $this->assertContains('Inside Basis / Capital Reconciliation', $names);
        $this->assertContains('Distribution & Liquidation Analysis', $names);
        $this->assertContains('Form 8949 Dispositions', $names);
        $this->assertContains('Transaction & Statement Reconciliation', $names);
        $this->assertContains('Basis Source Lines', $names);
    }

    private function event(int $userId, int $interestId, int $year, string $eventType, int $amountCents, string $reviewStatus): void
    {
        FinPartnershipBasisEvent::create([
            'user_id' => $userId,
            'partnership_interest_id' => $interestId,
            'tax_year' => $year,
            'event_type' => $eventType,
            'amount_cents' => $amountCents,
            'source_type' => 'manual',
            'review_status' => $reviewStatus,
        ]);
    }

    private function datedEvent(int $userId, int $interestId, int $year, string $eventType, int $amountCents, ?string $eventDate): void
    {
        FinPartnershipBasisEvent::create([
            'user_id' => $userId,
            'partnership_interest_id' => $interestId,
            'tax_year' => $year,
            'event_date' => $eventDate,
            'event_type' => $eventType,
            'amount_cents' => $amountCents,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);
    }
}
