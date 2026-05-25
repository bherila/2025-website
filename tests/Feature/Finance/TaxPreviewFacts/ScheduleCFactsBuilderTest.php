<?php

namespace Tests\Feature\Finance\TaxPreviewFacts;

use App\Models\FinanceTool\FinAccounts;
use App\Services\Finance\TaxPreviewFactsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ScheduleCFactsBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_emits_gross_receipts_returns_expenses_before_home_office_and_prior_carryforward(): void
    {
        $user = $this->createUser();
        $account = $this->createAccount($user->id);
        $entityId = $this->createEmploymentEntity($user->id, 'Reconciled LLC');

        $advertisingTag = $this->createScheduleCTag($user->id, $entityId, 'sce_advertising', 'Advertising');
        $suppliesTag = $this->createScheduleCTag($user->id, $entityId, 'sce_supplies', 'Supplies');
        $officeTag = $this->createScheduleCTag($user->id, $entityId, 'sce_office_expenses', 'Office');
        $homeOfficeRentTag = $this->createScheduleCTag($user->id, $entityId, 'scho_rent', 'Home office rent');
        $homeOfficeDepreciationTag = $this->createScheduleCTag($user->id, $entityId, 'scho_depreciation', 'Home office depreciation');

        $this->tagTransaction($account->acct_id, $advertisingTag, '2025-02-01', -176);
        $this->tagTransaction($account->acct_id, $suppliesTag, '2025-03-01', -100);
        $this->tagTransaction($account->acct_id, $officeTag, '2025-04-01', -200);
        $this->tagTransaction($account->acct_id, $homeOfficeRentTag, '2025-05-01', -5000);
        $this->tagTransaction($account->acct_id, $homeOfficeDepreciationTag, '2025-06-01', -2000);

        $this->createScheduleCInput($user->id, $entityId, 2025, [
            'gross_receipts' => 12883,
            'returns_and_allowances' => 961,
        ]);
        $this->createForm8829Input($user->id, $entityId, 2025, [
            'office_sqft' => 100,
            'home_sqft' => 1000,
            'prior_year_op_carryover' => 12738,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025);
        $scheduleC = $facts['scheduleC'];

        $this->assertSame(12883.0, $scheduleC['grossReceiptsTotal']);
        $this->assertSame(961.0, $scheduleC['returnsAndAllowancesTotal']);
        $this->assertSame(476.0, $scheduleC['expensesBeforeHomeOffice']);
        $this->assertSame(476.0, $scheduleC['expensesTotal']);

        // Schedule C grossIncomeAfterReturns = 12883 - 961 = 11922
        $this->assertSame(11922.0, $scheduleC['grossIncomeAfterReturns']);
        // tentativeProfitBeforeHomeOffice = 11922 - 476 = 11446
        $this->assertSame(11446.0, $scheduleC['tentativeProfitBeforeHomeOffice']);

        // §280A(c)(5) caps the home-office deduction at gross income from business use of home,
        // minus business deductions allocable to that home use. Here:
        //   line 8 tentative profit = 11446
        //   line 14 (mortgage/RE tax allowable) = 0
        //   line 15 operating-expense limit = 11446 - 0 = 11446
        //   line 24 allowable indirect operating expenses = rent allowable = 5000 * 0.1 = 500
        //   line 25 prior-year operating carryover = 12738
        //   line 26 total operating-expense claim = 500 + 12738 = 13238
        //   line 27 allowable operating expenses = min(11446, 13238) = 11446
        //   line 28 excess casualty/depreciation limit = max(0, 11446 - 11446) = 0
        //   line 30 depreciation allowable = 2000 * 0.1 = 200
        //   line 31 prior-year casualty/depreciation carryover = 0
        //   line 32 total = 200 + 0 = 200
        //   line 33 allowable depreciation = min(0, 200) = 0
        //   line 36 total allowable home-office deduction = 14 + 27 + 33 = 0 + 11446 + 0 = 11446
        //   line 43 op carryover = max(0, 13238 - 11446) = 1792
        //   line 44 casualty/dep carryover = max(0, 200 - 0) = 200
        //   carryover to next year = 1792 + 200 = 1992
        $this->assertSame(12738.0, $scheduleC['homeOfficePriorCarryforward']);
        $this->assertSame(11446.0, $scheduleC['homeOfficeAllowable']);
        $this->assertSame(1992.0, $scheduleC['homeOfficeCarryoverToNextYear']);

        // netProfit = 11446 - 11446 = 0 (home-office deduction fully absorbed tentative profit)
        $this->assertSame(0.0, $scheduleC['netProfit']);

        // §280A(c)(5) cap assertion: total claim never exceeds gross income from business use of home,
        // and unused deduction carries forward.
        $form8829Entity = $facts['form8829']['entities'][0];
        $this->assertSame(11446.0, $form8829Entity['line8TentativeProfit']);
        $this->assertSame(12738.0, $form8829Entity['line25PriorYearOpCarryover']);
        $this->assertSame(11446.0, $form8829Entity['line36AllowableHomeOfficeDeduction']);
        $this->assertSame(1792.0, $form8829Entity['line43OperatingCarryoverToNextYear']);
        $this->assertSame(200.0, $form8829Entity['line44ExcessCasualtyAndDepreciationCarryoverToNextYear']);
        $this->assertSame(1992.0, $form8829Entity['carryoverToNextYear']);

        // §280A(c)(5) cap symmetry: allowed home-office deduction + carryover to next year
        // equals the sum of current home-office expense allowable + prior-year carryforward.
        $totalAllowedPlusCarryover = $scheduleC['homeOfficeAllowable'] + $scheduleC['homeOfficeCarryoverToNextYear'];
        $totalAvailable = $scheduleC['homeOfficePriorCarryforward'] + ($form8829Entity['line24AllowableOperatingIndirectExpenses'] + $form8829Entity['line30Depreciation']);
        $this->assertSame($totalAvailable, $totalAllowedPlusCarryover);
    }

    public function test_schedule_c_input_alone_emits_gross_receipts_without_tagged_transactions(): void
    {
        $user = $this->createUser();
        $entityId = $this->createEmploymentEntity($user->id, 'Cash-Basis LLC');

        $this->createScheduleCInput($user->id, $entityId, 2025, [
            'gross_receipts' => 5000,
            'returns_and_allowances' => 100,
        ]);

        $facts = app(TaxPreviewFactsService::class)->arrayForYear($user->id, 2025, 'scheduleC');
        $scheduleC = $facts['scheduleC'];

        $this->assertSame(5000.0, $scheduleC['grossReceiptsTotal']);
        $this->assertSame(100.0, $scheduleC['returnsAndAllowancesTotal']);
        $this->assertSame(0.0, $scheduleC['expensesBeforeHomeOffice']);
        $this->assertSame(4900.0, $scheduleC['netProfit']);
    }

    private function createAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => 'Brokerage',
        ]));
    }

    private function createEmploymentEntity(int $userId, string $displayName): int
    {
        return (int) DB::table('fin_employment_entity')->insertGetId([
            'user_id' => $userId,
            'display_name' => $displayName,
            'start_date' => '2024-01-01',
            'type' => 'sch_c',
            'is_current' => true,
            'is_spouse' => false,
            'is_hidden' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createScheduleCTag(int $userId, int $entityId, string $taxCharacteristic, string $label): int
    {
        return (int) DB::table('fin_account_tag')->insertGetId([
            'tag_userid' => (string) $userId,
            'tag_color' => '#2563eb',
            'tag_label' => $label,
            'tax_characteristic' => $taxCharacteristic,
            'employment_entity_id' => $entityId,
        ]);
    }

    private function tagTransaction(int $accountId, int $tagId, string $date, float $amount): void
    {
        $transactionId = (int) DB::table('fin_account_line_items')->insertGetId([
            't_account' => $accountId,
            't_date' => $date,
            't_type' => 'Debit',
            't_amt' => $amount,
            't_description' => 'Tagged Schedule C transaction',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('fin_account_line_item_tag_map')->insert([
            't_id' => $transactionId,
            'tag_id' => $tagId,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createScheduleCInput(int $userId, int $entityId, int $year, array $overrides = []): void
    {
        DB::table('fin_schedule_c_inputs')->insert(array_merge([
            'user_id' => $userId,
            'employment_entity_id' => $entityId,
            'tax_year' => $year,
            'gross_receipts' => 0,
            'returns_and_allowances' => 0,
            'other_income' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createForm8829Input(int $userId, int $entityId, int $year, array $overrides = []): void
    {
        DB::table('fin_form_8829_inputs')->insert(array_merge([
            'user_id' => $userId,
            'employment_entity_id' => $entityId,
            'tax_year' => $year,
            'method' => 'regular',
            'office_sqft' => null,
            'home_sqft' => null,
            'months_used' => 12,
            'prior_year_op_carryover' => 0,
            'prior_year_op_carryover_ca' => 0,
            'prior_year_depreciation_carryover' => 0,
            'prior_year_depreciation_carryover_ca' => 0,
            'notes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }
}
