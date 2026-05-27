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

        $this->makeLot($account, ['source' => FinAccountLot::SOURCE_BROKER_1099B]);
        $this->makeLot($account, ['source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED]);

        $result = $this->service->query([
            'user_id' => (int) $user->id,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        $this->assertCount(1, $result->items());
        $this->assertEquals(FinAccountLot::SOURCE_BROKER_1099B, $this->items($result)[0]->source);
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
