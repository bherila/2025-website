<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CapitalGainsReconciliationControllerTest extends TestCase
{
    use RefreshDatabase;

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
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        $costBasis = (float) ($overrides['cost_basis'] ?? 1000);
        $proceeds = isset($overrides['proceeds']) ? (float) $overrides['proceeds'] : null;
        $gain = $proceeds !== null ? $proceeds - $costBasis : null;

        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => $overrides['symbol'] ?? 'AAPL',
            'description' => $overrides['description'] ?? 'Test Stock',
            'quantity' => $overrides['quantity'] ?? 10,
            'purchase_date' => $overrides['purchase_date'] ?? '2024-01-01',
            'sale_date' => $overrides['sale_date'] ?? null,
            'cost_basis' => $costBasis,
            'proceeds' => $proceeds,
            'realized_gain_loss' => $gain,
            'is_short_term' => $overrides['is_short_term'] ?? true,
            'lot_source' => $overrides['lot_source'] ?? 'analyzer',
            'tax_document_id' => $overrides['tax_document_id'] ?? null,
            'form_8949_box' => $overrides['form_8949_box'] ?? 'A',
            'is_covered' => $overrides['is_covered'] ?? true,
            'wash_sale_disallowed' => $overrides['wash_sale_disallowed'] ?? null,
        ]);
    }

    public function test_form_8949_endpoint_does_not_double_count_reported_and_account_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 1000,
            'proceeds' => 1500,
            'lot_source' => FinAccountLot::SOURCE_1099B,
        ]);

        $this->makeLot($account, [
            'symbol' => 'AAPL',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 1000,
            'proceeds' => 1500,
            'lot_source' => 'analyzer',
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/capital-gains/form-8949?tax_year=2024');

        $response->assertOk()
            ->assertJsonPath('schedule_d_rollup.0.total_proceeds', 1500)
            ->assertJsonPath('schedule_d_rollup.0.total_cost_basis', 1000)
            ->assertJsonPath('schedule_d_rollup.0.net_gain_or_loss', 500)
            ->assertJsonPath('schedule_d_rollup.0.row_count', 1)
            ->assertJsonCount(1, 'rows');
    }

    public function test_wash_sales_endpoint_returns_detection_note_and_counts(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);

        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'quantity' => 10,
            'purchase_date' => '2024-01-01',
            'sale_date' => '2024-12-01',
            'cost_basis' => 1000,
            'proceeds' => 800,
        ]);
        $this->makeLot($account, [
            'symbol' => 'TSLA',
            'quantity' => 10,
            'purchase_date' => '2024-12-01',
            'sale_date' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/finance/capital-gains/wash-sales?tax_year=2024');

        $response->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('same_account_count', 1)
            ->assertJsonPath('adjustments.0.disallowed_loss', 200)
            ->assertJsonPath('adjustments.0.detection_note', 'Matched by normalized ticker symbol. Review manually for other substantially identical securities such as options, share classes, or paired funds.');
    }

    public function test_capital_gains_endpoints_validate_tax_year(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->getJson('/api/finance/capital-gains/form-8949?tax_year=not-a-year')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('tax_year');
    }
}
