<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialPlanningControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_financial_planning_landing_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning');

        $response->assertStatus(200);
        $response->assertSee('<title>Financial Planning | '.config('app.name', 'Ben Herila').'</title>', false);
        $response->assertSee('id="app"', false);
    }

    public function test_solo_401k_calculator_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning/solo-401k');

        $response->assertStatus(200);
        $response->assertSee('<title>Solo 401(k) Calculator | '.config('app.name', 'Ben Herila').'</title>', false);
        $response->assertSee('id="app"', false);
    }

    public function test_rent_vs_buy_page_has_title(): void
    {
        $this->withoutVite();

        $response = $this->get('/financial-planning/rent-vs-buy');

        $response->assertStatus(200);
        $response->assertSee('<title>Rent vs. Buy a Home | '.config('app.name', 'Ben Herila').'</title>', false);
        $response->assertSee('id="app"', false);
    }
}
