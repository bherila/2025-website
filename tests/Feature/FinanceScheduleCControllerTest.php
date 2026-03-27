<?php

namespace Tests\Feature;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Database\QueryException;
use Tests\TestCase;

class FinanceScheduleCControllerTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helper: create an account owned by the authenticated user
    // -------------------------------------------------------------------------

    private function createAccount(int $userId, string $name = 'Checking'): FinAccounts
    {
        return FinAccounts::withoutGlobalScopes()->create([
            'acct_owner' => $userId,
            'acct_name' => $name,
        ]);
    }

    private function createTransaction(int $acctId, string $date, float $amount, string $desc = 'Expense'): FinAccountLineItems
    {
        return FinAccountLineItems::create([
            't_account' => $acctId,
            't_date' => $date,
            't_amt' => $amount,
            't_description' => $desc,
        ]);
    }

    private function createTagWithChar(int $userId, string $label, string $taxChar): FinAccountTag
    {
        return FinAccountTag::create([
            'tag_userid' => $userId,
            'tag_label' => $label,
            'tag_color' => 'blue',
            'tax_characteristic' => $taxChar,
        ]);
    }

    private function applyTag(int $tId, int $tagId): void
    {
        FinAccountLineItemTagMap::create([
            't_id' => $tId,
            'tag_id' => $tagId,
        ]);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    public function test_returns_empty_years_when_no_schedule_c_tags(): void
    {
        $user = $this->createUser();

        // Tag without tax_characteristic should be excluded
        FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Personal',
            'tag_color' => 'gray',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk()->assertJson(['available_years' => [], 'years' => []]);
    }

    public function test_returns_expense_totals_grouped_by_year(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);

        $tag = $this->createTagWithChar($user->id, 'Office Supplies', 'sce_office_expenses');

        $t2023 = $this->createTransaction($acct->acct_id, '2023-06-01', -150.00, 'Printer paper');
        $t2024 = $this->createTransaction($acct->acct_id, '2024-03-15', -200.00, 'Desk lamp');

        $this->applyTag($t2023->t_id, $tag->tag_id);
        $this->applyTag($t2024->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');

        // Should have two years (sorted desc)
        $this->assertCount(2, $years);

        // Most recent year first
        $this->assertEquals('2024', $years[0]['year']);
        $this->assertEquals('2023', $years[1]['year']);

        // 2024 has one expense entry (inside entities array)
        $expense2024 = $years[0]['entities'][0]['schedule_c_expense'];
        $this->assertArrayHasKey('sce_office_expenses', $expense2024);
        $this->assertEqualsWithDelta(200.00, $expense2024['sce_office_expenses']['total'], 0.001);
        $this->assertEquals('Office expenses', $expense2024['sce_office_expenses']['label']);

        // 2023 has one expense entry
        $expense2023 = $years[1]['entities'][0]['schedule_c_expense'];
        $this->assertArrayHasKey('sce_office_expenses', $expense2023);
        $this->assertEqualsWithDelta(150.00, $expense2023['sce_office_expenses']['total'], 0.001);
    }

    public function test_returns_home_office_totals(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id, 'Home');

        $tag = $this->createTagWithChar($user->id, 'Home Rent', 'scho_rent');
        $t = $this->createTransaction($acct->acct_id, '2024-01-01', -1200.00, 'Monthly rent');
        $this->applyTag($t->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $this->assertCount(1, $years);

        $homeOffice = $years[0]['entities'][0]['schedule_c_home_office'];
        $this->assertArrayHasKey('scho_rent', $homeOffice);
        $this->assertEqualsWithDelta(1200.00, $homeOffice['scho_rent']['total'], 0.001);
        $this->assertEquals('Rent', $homeOffice['scho_rent']['label']);

        // No expense entries
        $this->assertEmpty($years[0]['entities'][0]['schedule_c_expense']);
    }

    public function test_aggregates_multiple_tags_same_category(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);

        // Two different tags both pointing to sce_meals
        $tag1 = $this->createTagWithChar($user->id, 'Lunch', 'sce_meals');
        $tag2 = $this->createTagWithChar($user->id, 'Dinner', 'sce_meals');

        $t1 = $this->createTransaction($acct->acct_id, '2024-05-01', -30.00, 'Lunch');
        $t2 = $this->createTransaction($acct->acct_id, '2024-05-02', -60.00, 'Dinner');

        $this->applyTag($t1->t_id, $tag1->tag_id);
        $this->applyTag($t2->t_id, $tag2->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $this->assertCount(1, $years);

        $meals = $years[0]['entities'][0]['schedule_c_expense']['sce_meals'] ?? null;
        $this->assertNotNull($meals);
        $this->assertEqualsWithDelta(90.00, $meals['total'], 0.001);
    }

    public function test_excludes_soft_deleted_tag_mappings(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Travel', 'sce_travel');

        $t1 = $this->createTransaction($acct->acct_id, '2024-01-01', -500.00, 'Flight');
        $t2 = $this->createTransaction($acct->acct_id, '2024-02-01', -100.00, 'Train (deleted)');

        // Active mapping
        $this->applyTag($t1->t_id, $tag->tag_id);
        // Soft-deleted mapping
        FinAccountLineItemTagMap::create([
            't_id' => $t2->t_id,
            'tag_id' => $tag->tag_id,
            'when_deleted' => now(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $this->assertCount(1, $years);

        $travel = $years[0]['entities'][0]['schedule_c_expense']['sce_travel'] ?? null;
        $this->assertNotNull($travel);
        // Only $500 flight should be counted (not the deleted $100 train)
        $this->assertEqualsWithDelta(500.00, $travel['total'], 0.001);
    }

    public function test_excludes_transactions_from_other_users(): void
    {
        $user = $this->createUser();
        $otherUser = $this->createUser();

        // Create other user's account while authenticated as them
        $this->actingAs($otherUser);
        $otherAcct = FinAccounts::create([
            'acct_name' => 'Other Checking',
        ]);
        $otherTag = $this->createTagWithChar($otherUser->id, 'Other Meals', 'sce_meals');
        $tOther = FinAccountLineItems::create([
            't_account' => $otherAcct->acct_id,
            't_date' => '2024-01-01',
            't_amt' => -500.00,
        ]);
        $this->applyTag($tOther->t_id, $otherTag->tag_id);

        // Now request as the primary user (who has no tagged transactions)
        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk()->assertJson(['available_years' => [], 'years' => []]);
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $response = $this->getJson('/api/finance/schedule-c');
        $response->assertUnauthorized();
    }

    public function test_year_filter_returns_only_matching_year(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Office Supplies', 'sce_office_expenses');

        $t2023 = $this->createTransaction($acct->acct_id, '2023-06-01', -150.00, 'Printer paper');
        $t2024 = $this->createTransaction($acct->acct_id, '2024-03-15', -200.00, 'Desk lamp');

        $this->applyTag($t2023->t_id, $tag->tag_id);
        $this->applyTag($t2024->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c?year=2024');

        $response->assertOk();
        $years = $response->json('years');

        // Only 2024 should be returned
        $this->assertCount(1, $years);
        $this->assertEquals('2024', $years[0]['year']);
    }

    public function test_year_filter_available_years_always_includes_all_years(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Meals Tag', 'sce_meals');

        $t2022 = $this->createTransaction($acct->acct_id, '2022-01-01', -50.00, 'Lunch 2022');
        $t2024 = $this->createTransaction($acct->acct_id, '2024-01-01', -80.00, 'Lunch 2024');

        $this->applyTag($t2022->t_id, $tag->tag_id);
        $this->applyTag($t2024->t_id, $tag->tag_id);

        // Filter by 2024 — but available_years should still contain both 2024 and 2022
        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c?year=2024');

        $response->assertOk();
        $availableYears = $response->json('available_years');
        $this->assertContains('2024', $availableYears);
        $this->assertContains('2022', $availableYears);
    }

    public function test_year_filter_returns_empty_years_when_no_data_for_year(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Travel', 'sce_travel');
        $t = $this->createTransaction($acct->acct_id, '2023-06-01', -300.00, 'Flight 2023');
        $this->applyTag($t->t_id, $tag->tag_id);

        // Filter by 2024 — no data exists for 2024
        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c?year=2024');

        $response->assertOk();
        $this->assertEmpty($response->json('years'));
        // But available_years should still contain 2023
        $this->assertContains('2023', $response->json('available_years'));
    }

    public function test_response_has_correct_structure(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Ads', 'sce_advertising');
        $t = $this->createTransaction($acct->acct_id, '2024-01-01', -100.00);
        $this->applyTag($t->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk()
            ->assertJsonStructure([
                'available_years',
                'years' => [
                    [
                        'year',
                        'entities' => [
                            [
                                'entity_id',
                                'entity_name',
                                'schedule_c_expense',
                                'schedule_c_home_office',
                            ],
                        ],
                    ],
                ],
            ]);

        // Verify available_years is populated
        $this->assertContains('2024', $response->json('available_years'));

        // Verify transaction sub-array is included
        $expense = $response->json('years.0.entities.0.schedule_c_expense.sce_advertising');
        $this->assertArrayHasKey('transactions', $expense);
        $this->assertCount(1, $expense['transactions']);
        $this->assertEquals($t->t_id, $expense['transactions'][0]['t_id']);
        $this->assertEquals('2024-01-01', $expense['transactions'][0]['t_date']);
        $this->assertEquals($acct->acct_id, $expense['transactions'][0]['t_account']);
    }

    public function test_amounts_are_displayed_as_positive_numbers(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Utilities Tag', 'sce_utilities');
        $t = $this->createTransaction($acct->acct_id, '2024-01-01', -250.00, 'Electric bill');
        $this->applyTag($t->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $total = $years[0]['entities'][0]['schedule_c_expense']['sce_utilities']['total'] ?? null;

        // Should be POSITIVE (expenses shown as positive on Schedule C)
        $this->assertGreaterThan(0, $total);
        $this->assertEqualsWithDelta(250.00, $total, 0.001);
    }

    public function test_tags_with_null_tax_characteristic_are_excluded(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        // Tag with null tax_characteristic should be excluded from Schedule C
        FinAccountTag::create([
            'tag_userid' => $user->id,
            'tag_label' => 'Personal',
            'tag_color' => 'red',
            'tax_characteristic' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk()->assertJson(['years' => []]);
    }

    public function test_year_is_returned_as_integer(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id);
        $tag = $this->createTagWithChar($user->id, 'Office Supplies', 'sce_office_expenses');
        $t = $this->createTransaction($acct->acct_id, '2024-03-15', -200.00, 'Desk lamp');
        $this->applyTag($t->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $this->assertCount(1, $years);
        $this->assertIsInt($years[0]['year']);
        $this->assertSame(2024, $years[0]['year']);
    }

    public function test_entities_with_only_home_office_data_are_included(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);

        $acct = $this->createAccount($user->id, 'Home');
        $tag = $this->createTagWithChar($user->id, 'Home Rent', 'scho_rent');
        $t = $this->createTransaction($acct->acct_id, '2026-02-02', -3600.00, 'Monthly rent');
        $this->applyTag($t->t_id, $tag->tag_id);

        $response = $this->actingAs($user)->getJson('/api/finance/schedule-c');

        $response->assertOk();
        $years = $response->json('years');
        $this->assertCount(1, $years);
        $this->assertSame(2026, $years[0]['year']);

        $entity = $years[0]['entities'][0];
        $this->assertEmpty($entity['schedule_c_income']);
        $this->assertEmpty($entity['schedule_c_expense']);
        $this->assertArrayHasKey('scho_rent', $entity['schedule_c_home_office']);
        $this->assertEqualsWithDelta(3600.00, $entity['schedule_c_home_office']['scho_rent']['total'], 0.001);
    }

    public function test_sqlite_check_constraint_rejects_invalid_tax_characteristic(): void
    {
        // The CHECK constraint on SQLite (and ENUM on MySQL) should reject invalid values.
        // Expect a QueryException when inserting a value not in the allowed set.
        $this->expectException(QueryException::class);

        FinAccountTag::create([
            'tag_userid' => 1,
            'tag_label' => 'Bad Tag',
            'tag_color' => 'gray',
            'tax_characteristic' => 'invalid_value_not_in_enum',
        ]);
    }
}
