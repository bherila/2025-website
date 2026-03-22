<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinanceTransactionsDedupeApiControllerTest extends TestCase
{
    use RefreshDatabase;

    private function createAccount(int $userId): int
    {
        return DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $userId,
            'acct_name' => 'Test Account '.uniqid(),
            'acct_last_balance' => '0',
        ]);
    }

    private function createTransaction(int $acctId, array $attrs = []): int
    {
        return DB::table('fin_account_line_items')->insertGetId(array_merge([
            't_account' => $acctId,
            't_date' => '2024-01-01',
            't_amt' => '-100.00',
            't_description' => 'Test',
            't_qty' => null,
            't_symbol' => null,
        ], $attrs));
    }

    private function createLink(int $parentId, int $childId): void
    {
        DB::table('fin_account_line_item_links')->insert([
            'parent_t_id' => $parentId,
            'child_t_id' => $childId,
        ]);
    }

    /**
     * Regression test: merging linked duplicate transactions must not cause a
     * UNIQUE constraint violation on fin_account_line_item_links.
     */
    public function test_merge_linked_duplicates_does_not_cause_key_violation(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, ['t_description' => 'A', 't_amt' => '-50.00']);
        $t2 = $this->createTransaction($acctId, ['t_description' => 'A', 't_amt' => '-50.00']);

        $t3 = $this->createTransaction($acctId, ['t_description' => 'B', 't_amt' => '50.00']);
        $t4 = $this->createTransaction($acctId, ['t_description' => 'B', 't_amt' => '50.00']);

        $this->createLink($t1, $t3);
        $this->createLink($t2, $t4);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'merges' => [
                ['keepId' => $t1, 'deleteIds' => [$t2]],
                ['keepId' => $t3, 'deleteIds' => [$t4]],
            ],
        ]);

        $response->assertOk();
        $this->assertEquals(2, $response->json('mergedCount'));

        $this->assertDatabaseMissing('fin_account_line_items', ['t_id' => $t2]);
        $this->assertDatabaseMissing('fin_account_line_items', ['t_id' => $t4]);

        $links = DB::table('fin_account_line_item_links')
            ->where('parent_t_id', $t1)
            ->where('child_t_id', $t3)
            ->count();
        $this->assertEquals(1, $links);

        $selfLinks = DB::table('fin_account_line_item_links')
            ->whereColumn('parent_t_id', 'child_t_id')
            ->count();
        $this->assertEquals(0, $selfLinks);
    }

    /**
     * Merging when the two duplicate transactions are themselves linked to each other
     * must not leave a self-referential link (t1->t1).
     */
    public function test_merge_self_linked_duplicates_removes_link(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, ['t_description' => 'X', 't_amt' => '-100.00']);
        $t2 = $this->createTransaction($acctId, ['t_description' => 'X', 't_amt' => '-100.00']);

        $this->createLink($t1, $t2);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'merges' => [
                ['keepId' => $t1, 'deleteIds' => [$t2]],
            ],
        ]);

        $response->assertOk();

        $selfLinks = DB::table('fin_account_line_item_links')
            ->whereColumn('parent_t_id', 'child_t_id')
            ->count();
        $this->assertEquals(0, $selfLinks);
    }

    /**
     * Test that creating a new statement with cost basis override saves correctly.
     */
    public function test_create_statement_saves_cost_basis_override(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/balance-timeseries", [
            'balance' => '1500.00',
            'statement_closing_date' => '2024-03-31',
            'is_cost_basis_override' => true,
            'cost_basis' => 1200.00,
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId,
            'balance' => '1500.00',
            'is_cost_basis_override' => 1,
            'cost_basis' => 1200.0,
        ]);
    }

    /**
     * Test that creating a new statement without override saves cost_basis as 0.
     */
    public function test_create_statement_without_override_defaults_cost_basis_to_zero(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/balance-timeseries", [
            'balance' => '2000.00',
            'statement_closing_date' => '2024-04-30',
            'is_cost_basis_override' => false,
        ]);

        $response->assertOk();

        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId,
            'balance' => '2000.00',
            'is_cost_basis_override' => 0,
            'cost_basis' => 0,
        ]);
    }

    /**
     * Test that markAsNotDuplicatePairs inserts into fin_transaction_non_duplicate_pairs
     * and the count is returned correctly.
     */
    public function test_mark_as_not_duplicate_pairs_stores_pair_in_database(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, ['t_description' => 'Buy AAPL', 't_amt' => '-500.00', 't_symbol' => 'AAPL']);
        $t2 = $this->createTransaction($acctId, ['t_description' => 'Buy AAPL', 't_amt' => '-500.00', 't_symbol' => 'AAPL']);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'markAsNotDuplicatePairs' => [
                ['t_id_1' => $t1, 't_id_2' => $t2],
            ],
        ]);

        $response->assertOk();
        $this->assertEquals(1, $response->json('markedAsNotDuplicate'));
        $this->assertEquals(0, $response->json('mergedCount'));

        $this->assertDatabaseHas('fin_transaction_non_duplicate_pairs', [
            't_id_1' => min($t1, $t2),
            't_id_2' => max($t1, $t2),
        ]);
    }

    /**
     * Test that markAsNotDuplicatePairs is idempotent (re-inserting the same pair
     * does not cause an error due to the UNIQUE constraint + insertOrIgnore).
     */
    public function test_mark_as_not_duplicate_pairs_is_idempotent(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, ['t_amt' => '-200.00']);
        $t2 = $this->createTransaction($acctId, ['t_amt' => '-200.00']);

        $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'markAsNotDuplicatePairs' => [['t_id_1' => $t1, 't_id_2' => $t2]],
        ])->assertOk();

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'markAsNotDuplicatePairs' => [['t_id_1' => $t1, 't_id_2' => $t2]],
        ]);
        $response->assertOk();

        $count = DB::table('fin_transaction_non_duplicate_pairs')
            ->where('t_id_1', min($t1, $t2))
            ->where('t_id_2', max($t1, $t2))
            ->count();
        $this->assertEquals(1, $count);
    }

    /**
     * Test that confirmed non-duplicate pairs are excluded from findDuplicates.
     */
    public function test_find_duplicates_excludes_confirmed_non_duplicate_pairs(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, [
            't_date' => '2024-06-01',
            't_amt' => '-300.00',
            't_description' => 'Coffee shop',
        ]);
        $t2 = $this->createTransaction($acctId, [
            't_date' => '2024-06-01',
            't_amt' => '-300.00',
            't_description' => 'Coffee shop',
        ]);

        // Before marking, they should appear as duplicates
        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/duplicates");
        $response->assertOk();
        $this->assertEquals(1, $response->json('total'));

        // Mark the pair as confirmed non-duplicates
        $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'markAsNotDuplicatePairs' => [['t_id_1' => $t1, 't_id_2' => $t2]],
        ])->assertOk();

        // Now they should not appear as duplicates
        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/duplicates");
        $response->assertOk();
        $this->assertEquals(0, $response->json('total'));
        $this->assertEquals(1, $response->json('previouslyMarkedCount'));
    }

    /**
     * Test that the findDuplicates endpoint prefers keeping the transaction
     * with more information (higher information score) when choosing which to keep.
     */
    public function test_find_duplicates_prefers_more_informative_transaction_as_keep(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        // T1 has fewer fields (no price, no type) - same symbol so they are in the same duplicate group
        $t1 = $this->createTransaction($acctId, [
            't_date' => '2024-03-15',
            't_amt' => '-150.00',
            't_description' => 'Stock purchase',
            't_symbol' => 'AAPL',
            't_price' => null,
            't_type' => null,
        ]);

        // T2 has more fields (has price and type) - should be preferred as KEEP
        $t2 = $this->createTransaction($acctId, [
            't_date' => '2024-03-15',
            't_amt' => '-150.00',
            't_description' => 'Stock purchase',
            't_symbol' => 'AAPL',
            't_price' => '150.00',
            't_type' => 'Buy',
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/duplicates");
        $response->assertOk();

        $groups = $response->json('groups');
        $this->assertCount(1, $groups);

        // T2 (more info) should be the "keep" transaction
        $this->assertEquals($t2, $groups[0]['keepId']);
        $this->assertContains($t1, $groups[0]['deleteIds']);
    }

    /**
     * Test that when both transactions have equal information,
     * the newer (higher t_id) transaction is kept.
     */
    public function test_find_duplicates_prefers_newer_transaction_when_equally_informative(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, [
            't_date' => '2024-04-10',
            't_amt' => '-75.00',
            't_description' => 'Grocery store',
            't_symbol' => null,
        ]);
        $t2 = $this->createTransaction($acctId, [
            't_date' => '2024-04-10',
            't_amt' => '-75.00',
            't_description' => 'Grocery store',
            't_symbol' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/finance/{$acctId}/duplicates");
        $response->assertOk();

        $groups = $response->json('groups');
        $this->assertCount(1, $groups);

        // T2 (higher ID = newer) should be the "keep" transaction
        $this->assertEquals($t2, $groups[0]['keepId']);
        $this->assertContains($t1, $groups[0]['deleteIds']);
    }

    /**
     * Test that non-duplicate pairs are cascade-deleted when a transaction is deleted.
     */
    public function test_non_duplicate_pair_cascade_deleted_with_transaction(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId, ['t_amt' => '-50.00']);
        $t2 = $this->createTransaction($acctId, ['t_amt' => '-50.00']);

        DB::table('fin_transaction_non_duplicate_pairs')->insert([
            't_id_1' => min($t1, $t2),
            't_id_2' => max($t1, $t2),
        ]);

        $this->assertDatabaseHas('fin_transaction_non_duplicate_pairs', [
            't_id_1' => min($t1, $t2),
            't_id_2' => max($t1, $t2),
        ]);

        // Delete t1 directly from the database
        DB::table('fin_account_line_items')->where('t_id', $t1)->delete();

        // The non-duplicate pair entry should have been cascade-deleted
        $this->assertDatabaseMissing('fin_transaction_non_duplicate_pairs', [
            't_id_1' => min($t1, $t2),
            't_id_2' => max($t1, $t2),
        ]);
    }

    /**
     * Test that markAsNotDuplicatePairs rejects transaction IDs from other accounts.
     */
    public function test_mark_as_not_duplicate_pairs_rejects_foreign_account_transactions(): void
    {
        $user = $this->createUser();
        $acctId1 = $this->createAccount($user->id);
        $acctId2 = $this->createAccount($user->id);

        $t1 = $this->createTransaction($acctId1, ['t_amt' => '-100.00']);
        $t2 = $this->createTransaction($acctId2, ['t_amt' => '-100.00']);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId1}/merge-duplicates", [
            'markAsNotDuplicatePairs' => [['t_id_1' => $t1, 't_id_2' => $t2]],
        ]);

        $response->assertOk();
        $this->assertEquals(0, $response->json('markedAsNotDuplicate'));
        $count = DB::table('fin_transaction_non_duplicate_pairs')->count();
        $this->assertEquals(0, $count);
    }
}
