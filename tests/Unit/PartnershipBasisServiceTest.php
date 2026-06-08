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

    public function test_prior_year_rollforward_and_downstream_stale_marking(): void
    {
        $interest = $this->interest('Rollforward LP');
        FinPartnershipBasisEvent::create([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2023,
            'event_type' => 'beginning_basis',
            'amount_cents' => 100_00,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);

        $firstYear = $this->service->recomputeInterestYear($interest, 2023);
        $secondYear = $this->service->recomputeInterestYear($interest, 2024);
        $this->assertSame($firstYear->ending_outside_basis_cents, $secondYear->beginning_outside_basis_cents);

        FinPartnershipBasisEvent::create([
            'user_id' => $this->user->id,
            'partnership_interest_id' => $interest->id,
            'tax_year' => 2023,
            'event_type' => 'taxable_income',
            'amount_cents' => 25_00,
            'source_type' => 'manual',
            'review_status' => 'reviewed',
        ]);
        $this->service->recomputeInterestYear($interest, 2023);

        $this->assertTrue(FinPartnershipBasisYear::where('id', $secondYear->id)->firstOrFail()->is_stale);
    }

    public function test_liquidation_with_cash_and_property_distributions_computes_liquidation_loss(): void
    {
        $interest = $this->interest('Liquidation LP');
        foreach ([
            ['beginning_basis', 100_00],
            ['liquidation_distribution_cash', 40_00],
            ['liquidation_distribution_property', 30_00],
        ] as [$eventType, $amount]) {
            FinPartnershipBasisEvent::create([
                'user_id' => $this->user->id,
                'partnership_interest_id' => $interest->id,
                'tax_year' => 2024,
                'event_type' => $eventType,
                'amount_cents' => $amount,
                'source_type' => 'manual',
                'review_status' => 'reviewed',
            ]);
        }

        $basisYear = $this->service->recomputeInterestYear($interest, 2024);
        $this->assertSame(30_00, $basisYear->ending_outside_basis_cents);
        $this->assertSame(-30_00, $basisYear->liquidation_gain_loss_cents);
    }

    public function test_basis_limited_losses_are_suspended(): void
    {
        $basisYear = $this->basisFromK1(2024, 'Loss LP', ['1' => '-150'], []);

        $this->assertSame(0, $basisYear->ending_outside_basis_cents);
        $this->assertSame(150_00, $basisYear->suspended_loss_carryforward_cents);
    }

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, array<int, array<string, string>>>  $codes
     * @param  array<string, mixed>  $basis
     */
    private function basisFromK1(int $year, string $name, array $fields, array $codes, array $basis = []): FinPartnershipBasisYear
    {
        $docFields = [
            'A' => ['value' => $name],
            'B' => ['value' => 'Partner'],
            'D' => ['value' => null],
        ];
        foreach ($fields as $box => $value) {
            $docFields[$box] = ['value' => $value];
        }

        FileForTaxDocument::create([
            'user_id' => $this->user->id,
            'tax_year' => $year,
            'form_type' => 'k1',
            'account_id' => $this->account->acct_id,
            'original_filename' => str_replace(' ', '-', strtolower($name)).'.pdf',
            'stored_filename' => str_replace(' ', '-', strtolower($name)).'.pdf',
            'file_size_bytes' => 1,
            'file_hash' => sha1(str_replace(' ', '-', strtolower($name))),
            'is_reviewed' => true,
            'parsed_data' => [
                'schemaVersion' => '2026.1',
                'formType' => 'K-1-1065',
                'fields' => $docFields,
                'codes' => $codes,
                'basis' => $basis,
            ],
        ]);

        $this->service->recomputeForUserYear($this->user->id, $year);

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
}
