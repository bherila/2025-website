<?php

namespace Tests\Feature;

use Tests\TestCase;

class FinancialPlanningPagesTest extends TestCase
{
    public function test_financial_planning_landing_page_is_public(): void
    {
        $response = $this->get('/financial-planning');

        $response->assertStatus(200);
        $response->assertSee('id="app"', false);
    }

    public function test_rent_vs_buy_page_is_public(): void
    {
        $response = $this->get('/financial-planning/rent-vs-buy');

        $response->assertStatus(200);
        $response->assertSee('Rent vs. Buy a Home');
        $response->assertSee('id="app"', false);
    }
}
