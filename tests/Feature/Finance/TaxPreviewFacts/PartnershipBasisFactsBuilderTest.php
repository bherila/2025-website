<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinPartnershipBasisYear;
use App\Models\FinanceTool\FinPartnershipInterest;
use App\Models\User;
use App\Services\Finance\PartnershipBasisService;
use App\Services\Finance\TaxPreviewFacts\Builders\PartnershipBasisFactsBuilder;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisFacts;
use App\Services\Finance\TaxPreviewFacts\Data\PartnershipBasisInterestFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnershipBasisFactsBuilderTest extends TestCase
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

    public function test_section754_step_up_surfaces_separately_from_other_box13_deductions(): void
    {
        $this->k1Document(2024, 'Section754 Facts LP', '47-1234567', [
            'A' => ['value' => '47-1234567'],
            'B' => ['value' => 'Section754 Facts LP'],
            'D' => ['value' => 'false'],
            '5' => ['value' => '100'],
        ], [
            '13' => [
                ['code' => 'W', 'value' => '15'],
                ['code' => 'A', 'value' => '10'],
            ],
        ]);
        $this->service->recomputeForUserYear($this->user->id, 2024);

        $facts = $this->build(2024);

        $this->assertCount(1, $facts->section754StepUpSources);
        $stepUp = $facts->section754StepUpSources[0];
        $this->assertSame(TaxFactSourceType::PartnershipSection754StepUp->value, $stepUp->sourceType);
        $this->assertSame(15.0, $stepUp->amount);
        $this->assertSame('13', $stepUp->box);
        $this->assertSame('W', $stepUp->code);
        $this->assertNotNull($stepUp->taxDocumentId);
        $this->assertSame('needs_review', $stepUp->reviewStatus);

        // The §754 step-up amortization is NOT lumped with the other Box 13 code-L deductions.
        $stepUpEvents = collect($facts->interests[0]->events)
            ->filter(fn ($event): bool => $event->eventType === 'section754_stepup_amortization');
        $this->assertCount(1, $stepUpEvents);
        $this->assertSame(15.0, $stepUpEvents->first()->amount);
    }

    public function test_basis_history_includes_all_persisted_years_through_preview_year_ascending(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2022, ['ending_outside_basis_cents' => 100_00, 'beginning_outside_basis_cents' => 0]);
        $this->basisYear($interest, 2023, ['beginning_outside_basis_cents' => 100_00, 'ending_outside_basis_cents' => 150_00, 'capital_contributions_cents' => 25_55]);
        $this->basisYear($interest, 2024, ['beginning_outside_basis_cents' => 150_00, 'ending_outside_basis_cents' => 175_00]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $years = array_map(fn ($summary): int => $summary->taxYear, $interestFact->basisHistory);
        $this->assertSame([2022, 2023, 2024], $years);

        $year2023 = $interestFact->basisHistory[1];
        $this->assertSame(150.0, $year2023->worksheet->endingOutsideBasis);
        $this->assertSame(100.0, $year2023->worksheet->beginningOutsideBasis);
        $this->assertSame(25.55, $year2023->worksheet->capitalContributions);
    }

    public function test_basis_history_excludes_years_after_preview_year(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, ['ending_outside_basis_cents' => 100_00]);
        $this->basisYear($interest, 2024, ['beginning_outside_basis_cents' => 100_00, 'ending_outside_basis_cents' => 120_00]);
        $this->basisYear($interest, 2025, ['beginning_outside_basis_cents' => 120_00, 'ending_outside_basis_cents' => 140_00]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $years = array_map(fn ($summary): int => $summary->taxYear, $interestFact->basisHistory);
        $this->assertSame([2023, 2024], $years);
    }

    public function test_basis_history_excludes_rows_for_other_users_with_the_same_interest_id(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2024, [
            'beginning_outside_basis_cents' => 100_00,
            'ending_outside_basis_cents' => 120_00,
            'review_status' => 'reviewed',
        ]);

        $otherUser = User::factory()->create();
        $this->basisYear($interest, 2023, [
            'user_id' => $otherUser->id,
            'ending_outside_basis_cents' => 999_00,
            'review_status' => 'reviewed',
        ]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $years = array_map(fn ($summary): int => $summary->taxYear, $interestFact->basisHistory);
        $this->assertSame([2024], $years);
        $this->assertNull($interestFact->carryoverMismatch);

        $history2024 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2024);
        $this->assertNotNull($history2024);
        $this->assertNull($history2024->carryoverMismatch);
    }

    public function test_carryover_mismatch_flags_non_null_signed_delta_and_action_needed(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, ['ending_outside_basis_cents' => 100_00]);
        // Current beginning (90.00) is less than prior ending (100.00) ⇒ +10.00 delta.
        $this->basisYear($interest, 2024, ['beginning_outside_basis_cents' => 90_00, 'ending_outside_basis_cents' => 130_00]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $this->assertSame(10.0, $interestFact->carryoverMismatch);
        $this->assertTrue($interestFact->hasActionNeeded);

        $history2024 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2024);
        $this->assertNotNull($history2024);
        $this->assertSame(10.0, $history2024->carryoverMismatch);
    }

    public function test_carryover_mismatch_is_null_on_exact_match_and_first_year(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, [
            'ending_outside_basis_cents' => 100_00,
            'review_status' => 'reviewed',
        ]);
        $this->basisYear($interest, 2024, [
            'beginning_outside_basis_cents' => 100_00,
            'ending_outside_basis_cents' => 120_00,
            'review_status' => 'reviewed',
        ]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $this->assertNull($interestFact->carryoverMismatch);
        $this->assertFalse($interestFact->hasActionNeeded, 'Reviewed, fresh, matching carryover ⇒ no action needed.');

        $history2023 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2023);
        $this->assertNotNull($history2023);
        $this->assertNull($history2023->carryoverMismatch, 'First persisted year has no prior, so mismatch is null.');

        $history2024 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2024);
        $this->assertNotNull($history2024);
        $this->assertNull($history2024->carryoverMismatch, 'Exact cents match yields null mismatch.');
    }

    public function test_locked_stale_and_review_status_propagate_per_history_year(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, [
            'ending_outside_basis_cents' => 100_00,
            'review_status' => 'reviewed',
            'is_stale' => false,
            'locked_at' => now(),
        ]);
        $this->basisYear($interest, 2024, [
            'beginning_outside_basis_cents' => 100_00,
            'ending_outside_basis_cents' => 120_00,
            'review_status' => 'needs_review',
            'is_stale' => true,
            'locked_at' => null,
        ]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $history2023 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2023);
        $history2024 = collect($interestFact->basisHistory)->firstWhere('taxYear', 2024);

        $this->assertNotNull($history2023);
        $this->assertTrue($history2023->isLocked);
        $this->assertFalse($history2023->isStale);
        $this->assertSame('reviewed', $history2023->reviewStatus);

        $this->assertNotNull($history2024);
        $this->assertFalse($history2024->isLocked);
        $this->assertTrue($history2024->isStale);
        $this->assertSame('needs_review', $history2024->reviewStatus);

        // is_stale and needs_review both drive action-needed on the preview year.
        $this->assertTrue($interestFact->hasActionNeeded);
    }

    public function test_historical_year_issues_drive_action_needed_even_when_preview_year_is_clean(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, [
            'ending_outside_basis_cents' => 100_00,
            'review_status' => 'needs_review',
            'is_stale' => false,
        ]);
        $this->basisYear($interest, 2024, [
            'beginning_outside_basis_cents' => 100_00,
            'ending_outside_basis_cents' => 120_00,
            'review_status' => 'reviewed',
            'is_stale' => false,
        ]);

        $facts = $this->build(2024);

        $interestFact = $this->onlyInterest($facts);
        $this->assertNull($interestFact->carryoverMismatch);
        $this->assertTrue($interestFact->hasActionNeeded);
    }

    public function test_builder_does_not_mutate_basis_rows(): void
    {
        $interest = $this->interest();
        $this->basisYear($interest, 2023, ['ending_outside_basis_cents' => 100_00]);
        $row2024 = $this->basisYear($interest, 2024, ['beginning_outside_basis_cents' => 90_00, 'ending_outside_basis_cents' => 120_00]);
        $originalUpdatedAt = $row2024->updated_at;
        $countBefore = FinPartnershipBasisYear::query()->count();

        $this->build(2024);

        $this->assertSame($countBefore, FinPartnershipBasisYear::query()->count());
        $row2024->refresh();
        $this->assertEquals($originalUpdatedAt, $row2024->updated_at);
    }

    private function interest(): FinPartnershipInterest
    {
        return FinPartnershipInterest::create([
            'user_id' => $this->user->id,
            'account_id' => $this->account->acct_id,
            'partnership_ein' => '47-7654321',
            'partnership_name' => 'History Facts LP',
            'normalized_partnership_name' => 'history facts lp',
            'form_type' => 'k1',
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function basisYear(FinPartnershipInterest $interest, int $year, array $overrides = []): FinPartnershipBasisYear
    {
        return FinPartnershipBasisYear::create(array_merge([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => $year,
            'review_status' => 'needs_review',
            'is_stale' => false,
        ], $overrides));
    }

    private function onlyInterest(PartnershipBasisFacts $facts): PartnershipBasisInterestFacts
    {
        $this->assertCount(1, $facts->interests);

        return $facts->interests[0];
    }

    private function build(int $year): PartnershipBasisFacts
    {
        $docs = FileForTaxDocument::query()
            ->where('user_id', $this->user->id)
            ->where('tax_year', $year)
            ->where('form_type', 'k1')
            ->get();

        return app(PartnershipBasisFactsBuilder::class)->build($this->user->id, $year, $docs);
    }

    /**
     * @param  array<string, array<string, mixed>>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     */
    private function k1Document(int $year, string $name, string $ein, array $fields, array $codes): FileForTaxDocument
    {
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
                'basis' => [],
            ],
        ]);
    }
}
