<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Tests\TestCase;

class TaxLotReconciliationEndpointTest extends TestCase
{
    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeClosedLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
        ], $overrides));
    }

    public function test_reconciliation_endpoint_requires_authentication(): void
    {
        $response = $this->getJson('/api/finance/lots/reconciliation?tax_year=2025');

        $response->assertUnauthorized();
    }

    public function test_reconciliation_endpoint_returns_owned_account_rows_for_year(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $this->makeClosedLot($account, ['lot_source' => '1099b']);
        $this->makeClosedLot($account, ['lot_source' => 'analyzer']);
        $this->makeClosedLot($account, [
            'symbol' => 'OLD',
            'lot_source' => '1099b',
            'sale_date' => '2024-12-31',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/lots/reconciliation?tax_year=2025');

        $response->assertOk()
            ->assertJsonPath('tax_year', 2025)
            ->assertJsonPath('summary.matched', 1)
            ->assertJsonPath('accounts.0.account_id', $account->acct_id)
            ->assertJsonPath('accounts.0.rows.0.status', 'matched');
    }

    public function test_account_reconciliation_endpoint_rejects_other_users_account(): void
    {
        $owner = $this->createUser();
        $attacker = $this->createUser();
        $account = $this->makeAccount($owner->id);

        $response = $this->actingAs($attacker)->getJson("/api/finance/{$account->acct_id}/lots/reconciliation?tax_year=2025");

        $response->assertNotFound();
    }

    public function test_apply_reconciliation_supersedes_statement_lot_and_form_8949_feed_excludes_it(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $reportedLot = $this->makeClosedLot($account, ['lot_source' => '1099b']);
        $statementLot = $this->makeClosedLot($account, ['lot_source' => 'analyzer']);

        $response = $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/lots/reconciliation/apply", [
            'supersede' => [[
                'keep_lot_id' => $reportedLot->lot_id,
                'drop_lot_id' => $statementLot->lot_id,
            ]],
        ]);

        $response->assertOk()->assertJson(['success' => true]);
        $this->assertDatabaseHas('fin_account_lots', [
            'lot_id' => $statementLot->lot_id,
            'superseded_by_lot_id' => $reportedLot->lot_id,
            'reconciliation_status' => 'accepted',
        ]);

        $lotsResponse = $this->actingAs($user)->getJson('/api/finance/all/lots?status=closed&year=2025');
        $lotsResponse->assertOk();
        $this->assertCount(1, $lotsResponse->json('lots'));
        $this->assertSame($reportedLot->lot_id, $lotsResponse->json('lots.0.lot_id'));
    }

    public function test_apply_reconciliation_rejects_lots_outside_account_scope(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Primary');
        $otherAccount = $this->makeAccount($user->id, 'Other');
        $reportedLot = $this->makeClosedLot($account, ['lot_source' => '1099b']);
        $otherLot = $this->makeClosedLot($otherAccount, ['lot_source' => 'analyzer']);

        $response = $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/lots/reconciliation/apply", [
            'supersede' => [[
                'keep_lot_id' => $reportedLot->lot_id,
                'drop_lot_id' => $otherLot->lot_id,
            ]],
        ]);

        $response->assertStatus(422);
    }

    public function test_apply_reconciliation_rejects_invalid_lot_ids_before_scope_checks(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $response = $this->actingAs($user)->postJson("/api/finance/{$account->acct_id}/lots/reconciliation/apply", [
            'supersede' => [[
                'keep_lot_id' => 0,
                'drop_lot_id' => -1,
            ]],
            'accept' => [0],
            'conflicts' => [[
                'lot_id' => 0,
                'status' => 'accepted',
            ]],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'supersede.0.keep_lot_id',
                'supersede.0.drop_lot_id',
                'accept.0',
                'conflicts.0.lot_id',
            ]);
    }
}
