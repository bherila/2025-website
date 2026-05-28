<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotWorkspaceService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LotWorkspaceServiceTest extends TestCase
{
    use RefreshDatabase;

    private LotWorkspaceService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(LotWorkspaceService::class);
    }

    public function test_single_account_scope_returns_only_that_accounts_lots(): void
    {
        $user = $this->createUser();
        $account1 = $this->makeAccount((int) $user->id, 'Brokerage 1');
        $account2 = $this->makeAccount((int) $user->id, 'Brokerage 2');

        $lot1 = $this->makeLot($account1, ['symbol' => 'AAPL']);
        $this->makeLot($account2, ['symbol' => 'GOOG']);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'account_ids' => [(int) $account1->acct_id],
        ]);

        $ids = array_map(static fn (FinAccountLot $lot): int => (int) $lot->lot_id, $this->items($result));
        $this->assertContains((int) $lot1->lot_id, $ids);
        $this->assertCount(1, $ids);
    }

    public function test_multi_account_scope_returns_lots_from_all_accounts(): void
    {
        $user = $this->createUser();
        $account1 = $this->makeAccount((int) $user->id, 'Brokerage 1');
        $account2 = $this->makeAccount((int) $user->id, 'Brokerage 2');

        $this->makeLot($account1, ['symbol' => 'AAPL']);
        $this->makeLot($account2, ['symbol' => 'GOOG']);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
        ]);

        $this->assertCount(2, $result->items());
    }

    public function test_year_filter_restricts_to_lots_sold_in_year(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $this->makeLot($account, ['sale_date' => '2025-06-15']);
        $this->makeLot($account, ['sale_date' => '2024-06-15']);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'year' => 2025,
        ]);

        $this->assertCount(1, $result->items());
    }

    public function test_source_filter_returns_only_matching_source(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $canonicalBrokerLot = $this->makeLot($account, ['source' => FinAccountLot::SOURCE_BROKER_1099B]);
        $accountLot = $this->makeLot($account, ['source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED]);
        $legacyBrokerLot = $this->makeLot($account, [
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_source' => FinAccountLot::SOURCE_1099B,
        ]);

        $brokerResult = $this->service->query([
            'user_id' => (int) $user->id,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
        $accountResult = $this->service->query([
            'user_id' => (int) $user->id,
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);

        $this->assertEqualsCanonicalizing(
            [(int) $canonicalBrokerLot->lot_id, (int) $legacyBrokerLot->lot_id],
            array_map(static fn (FinAccountLot $lot): int => (int) $lot->lot_id, $this->items($brokerResult)),
        );
        $this->assertSame([(int) $accountLot->lot_id], array_map(static fn (FinAccountLot $lot): int => (int) $lot->lot_id, $this->items($accountResult)));
    }

    public function test_source_summary_honors_legacy_1099b_lot_source(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $this->makeLot($account, ['source' => FinAccountLot::SOURCE_BROKER_1099B]);
        $this->makeLot($account, [
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_source' => FinAccountLot::SOURCE_1099B,
        ]);
        $this->makeLot($account, ['source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED]);

        $summary = $this->service->summary(['user_id' => (int) $user->id]);

        $this->assertSame(2, $summary['counts_by_source'][FinAccountLot::SOURCE_BROKER_1099B] ?? null);
        $this->assertSame(1, $summary['counts_by_source'][FinAccountLot::SOURCE_ACCOUNT_DERIVED] ?? null);
    }

    public function test_superseded_lots_hidden_by_default(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $lot1 = $this->makeLot($account);
        $this->makeLot($account, ['superseded_by_lot_id' => $lot1->lot_id]);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
        ]);

        $this->assertCount(1, $result->items());
    }

    public function test_include_superseded_shows_all_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $lot1 = $this->makeLot($account);
        $this->makeLot($account, ['superseded_by_lot_id' => $lot1->lot_id]);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'include_superseded' => true,
        ]);

        $this->assertCount(2, $result->items());
    }

    public function test_status_open_returns_lots_without_sale_date(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $this->makeLot($account, ['sale_date' => null, 'proceeds' => null, 'realized_gain_loss' => null]);
        $this->makeLot($account, ['sale_date' => '2025-06-15']);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'status' => 'open',
        ]);

        $this->assertCount(1, $result->items());
        $this->assertNull($this->items($result)[0]->sale_date);
    }

    public function test_summary_aggregates_correct_totals(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $this->makeLot($account, [
            'proceeds' => 1200,
            'cost_basis' => 1000,
            'realized_gain_loss' => 200,
            'wash_sale_disallowed' => 50,
        ]);
        $this->makeLot($account, [
            'proceeds' => 800,
            'cost_basis' => 900,
            'realized_gain_loss' => -100,
            'wash_sale_disallowed' => 0,
        ]);

        $summary = $this->service->summary([
            'user_id' => (int) $user->id,
        ]);

        $this->assertEquals(2000.0, $summary['total_proceeds']);
        $this->assertEquals(1900.0, $summary['total_basis']);
        $this->assertEquals(50.0, $summary['total_wash_sale']);
        $this->assertEquals(100.0, $summary['total_realized_gain']);
        $this->assertEquals(2, $summary['count']);
    }

    public function test_summary_includes_term_breakdown_split_by_short_long(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        // Two short-term realized lots.
        $this->makeLot($account, [
            'is_short_term' => true,
            'proceeds' => 1100,
            'cost_basis' => 1000,
            'realized_gain_loss' => 100,
        ]);
        $this->makeLot($account, [
            'is_short_term' => true,
            'proceeds' => 500,
            'cost_basis' => 600,
            'realized_gain_loss' => -100,
        ]);
        // One long-term realized lot.
        $this->makeLot($account, [
            'is_short_term' => false,
            'proceeds' => 2000,
            'cost_basis' => 1500,
            'realized_gain_loss' => 500,
        ]);
        // One open lot (is_short_term null) — must be excluded from the breakdown.
        $this->makeLot($account, [
            'is_short_term' => null,
            'sale_date' => null,
            'proceeds' => null,
            'realized_gain_loss' => null,
        ]);

        $summary = $this->service->summary(['user_id' => (int) $user->id]);

        $this->assertArrayHasKey('term_breakdown', $summary);
        $this->assertSame(2, $summary['term_breakdown']['short']['count']);
        $this->assertEquals(1600.0, $summary['term_breakdown']['short']['proceeds']);
        $this->assertEquals(1600.0, $summary['term_breakdown']['short']['basis']);
        $this->assertEquals(0.0, $summary['term_breakdown']['short']['realized_gain']);

        $this->assertSame(1, $summary['term_breakdown']['long']['count']);
        $this->assertEquals(2000.0, $summary['term_breakdown']['long']['proceeds']);
        $this->assertEquals(1500.0, $summary['term_breakdown']['long']['basis']);
        $this->assertEquals(500.0, $summary['term_breakdown']['long']['realized_gain']);
    }

    public function test_summary_term_breakdown_is_zero_when_no_realized_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        // Only an open lot.
        $this->makeLot($account, [
            'is_short_term' => null,
            'sale_date' => null,
            'proceeds' => null,
            'realized_gain_loss' => null,
        ]);

        $summary = $this->service->summary(['user_id' => (int) $user->id]);

        $this->assertSame(0, $summary['term_breakdown']['short']['count']);
        $this->assertSame(0, $summary['term_breakdown']['long']['count']);
        $this->assertEquals(0.0, $summary['term_breakdown']['short']['proceeds']);
        $this->assertEquals(0.0, $summary['term_breakdown']['long']['proceeds']);
    }

    public function test_symbol_filter(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);

        $this->makeLot($account, ['symbol' => 'AAPL']);
        $this->makeLot($account, ['symbol' => 'GOOG']);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'symbol' => 'AAPL',
        ]);

        $this->assertCount(1, $result->items());
        $this->assertEquals('AAPL', $this->items($result)[0]->symbol);
    }

    public function test_reconciliation_filters_and_summary_use_latest_link_state(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $acceptedLot = $this->makeLot($account, [
            'reconciliation_status' => FinLotReconciliationLink::STATE_IGNORED_DUPLICATE,
            'sale_date' => '2025-02-03',
            'proceeds' => 1000,
        ]);
        $noneLot = $this->makeLot($account, [
            'sale_date' => '2025-03-03',
            'proceeds' => 2000,
        ]);
        $outOfRangeLot = $this->makeLot($account, [
            'sale_date' => '2025-04-03',
            'proceeds' => 3000,
        ]);

        FinLotReconciliationLink::create([
            'account_lot_id' => $acceptedLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);
        FinLotReconciliationLink::create([
            'account_lot_id' => $outOfRangeLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_BROKER_ONLY,
        ]);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'date_from' => '2025-01-01',
            'date_to' => '2025-02-28',
            'reconciliation_state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);

        $this->assertSame([(int) $acceptedLot->lot_id], array_map(static fn (FinAccountLot $lot): int => (int) $lot->lot_id, $this->items($result)));
        $this->assertSame(FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE, $this->items($result)[0]->getAttribute('reconciliation_state'));

        $summary = $this->service->summary([
            'user_id' => (int) $user->id,
            'date_from' => '2025-01-01',
            'date_to' => '2025-02-28',
            'reconciliation_state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);

        $this->assertSame(1, $summary['count']);
        $this->assertSame(1000.0, $summary['total_proceeds']);
        $this->assertSame([
            FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE => 1,
        ], $summary['counts_by_state']);

        $noneResult = $this->service->query([
            'user_id' => (int) $user->id,
            'reconciliation_state' => 'none',
        ]);

        $this->assertSame([(int) $noneLot->lot_id], array_map(static fn (FinAccountLot $lot): int => (int) $lot->lot_id, $this->items($noneResult)));
    }

    public function test_reconciliation_filter_uses_only_the_latest_link_state(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount((int) $user->id);
        $lot = $this->makeLot($account, ['sale_date' => '2025-06-15', 'proceeds' => 5000]);

        // Older link in `auto_matched` state, newer link in `accepted_account_override`.
        // The workspace surfaces the newer link's state, so the filter must too —
        // otherwise the row would appear under `auto_matched` while its visible
        // state is `accepted_account_override`.
        FinLotReconciliationLink::create([
            'account_lot_id' => $lot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);
        FinLotReconciliationLink::create([
            'account_lot_id' => $lot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);

        $autoMatchedResult = $this->service->query([
            'user_id' => (int) $user->id,
            'reconciliation_state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);
        $this->assertSame([], $this->items($autoMatchedResult), 'Older auto_matched link must not match when a newer link supersedes it');

        $latestResult = $this->service->query([
            'user_id' => (int) $user->id,
            'reconciliation_state' => FinLotReconciliationLink::STATE_ACCEPTED_ACCOUNT_OVERRIDE,
        ]);
        $this->assertSame(
            [(int) $lot->lot_id],
            array_map(static fn (FinAccountLot $row): int => (int) $row->lot_id, $this->items($latestResult)),
            'The latest link state must match the filter'
        );
    }

    private function makeAccount(int $userId, string $name = 'Brokerage'): FinAccounts
    {
        return FinAccounts::withoutEvents(fn (): FinAccounts => FinAccounts::withoutGlobalScopes()->forceCreate([
            'acct_owner' => $userId,
            'acct_name' => $name.' '.fake()->unique()->numerify('####'),
            'acct_last_balance' => '0',
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $proceeds = isset($overrides['proceeds']) ? (float) $overrides['proceeds'] : 1000.0;
        $costBasis = isset($overrides['cost_basis']) ? (float) $overrides['cost_basis'] : 900.0;

        $attributes = array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => $proceeds,
            'cost_basis' => $costBasis,
            'realized_gain_loss' => $proceeds - $costBasis,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'wash_sale_disallowed' => 0,
        ], $overrides);

        return FinAccountLot::create($attributes);
    }

    /**
     * @param  LengthAwarePaginator<int, FinAccountLot>  $result
     * @return list<FinAccountLot>
     */
    private function items(LengthAwarePaginator $result): array
    {
        return array_values($result->items());
    }
}
