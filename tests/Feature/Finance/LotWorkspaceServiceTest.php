<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Services\Finance\CapitalGains\LotWorkspaceService;
use App\Services\Finance\DocumentIngestionService;
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

        $ids = collect($result->items())->pluck('lot_id')->map(fn ($id) => (int) $id)->all();
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
        $this->assertEquals(FinAccountLot::SOURCE_BROKER_1099B, $result->items()[0]->source);
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
        $this->assertNull($result->items()[0]->sale_date);
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
        $this->assertEquals('AAPL', $result->items()[0]->symbol);
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
}
