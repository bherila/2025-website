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
            'acct_name' => 'Test Account',
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
     *
     * Scenario:
     *   - T1 (keep) and T2 (delete) are duplicates; T1->T3 link exists.
     *   - T3 (keep) and T4 (delete) are duplicates; T2->T4 (= T2->T3) link exists.
     *   After merging, both links collapse to T1->T3 — only one should survive.
     */
    public function test_merge_linked_duplicates_does_not_cause_key_violation(): void
    {
        $user = $this->createUser();
        $acctId = $this->createAccount($user->id);

        // Two pairs of duplicates
        $t1 = $this->createTransaction($acctId, ['t_description' => 'A', 't_amt' => '-50.00']);
        $t2 = $this->createTransaction($acctId, ['t_description' => 'A', 't_amt' => '-50.00']); // duplicate of t1

        $t3 = $this->createTransaction($acctId, ['t_description' => 'B', 't_amt' => '50.00']);
        $t4 = $this->createTransaction($acctId, ['t_description' => 'B', 't_amt' => '50.00']); // duplicate of t3

        // Links: t1->t3 and t2->t4 (both pairs linked together)
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

        // t2 and t4 should be deleted
        $this->assertDatabaseMissing('fin_account_line_items', ['t_id' => $t2]);
        $this->assertDatabaseMissing('fin_account_line_items', ['t_id' => $t4]);

        // Exactly one link should remain: t1->t3
        $links = DB::table('fin_account_line_item_links')
            ->where('parent_t_id', $t1)
            ->where('child_t_id', $t3)
            ->count();
        $this->assertEquals(1, $links);

        // No self-referential links
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

        // The two duplicate transactions are linked to each other
        $this->createLink($t1, $t2);

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/merge-duplicates", [
            'merges' => [
                ['keepId' => $t1, 'deleteIds' => [$t2]],
            ],
        ]);

        $response->assertOk();

        // No self-referential links should exist
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
}
