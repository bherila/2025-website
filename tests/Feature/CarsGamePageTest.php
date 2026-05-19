<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarsGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_cars_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/games/parking-pickup');

        $response->assertOk()
            ->assertSee('cars-game-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
