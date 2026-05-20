<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MarbleSortGamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_marble_sort_game_page_is_publicly_accessible(): void
    {
        $response = $this->get('/games/marble-sort');

        $response->assertOk()
            ->assertSee('marble-sort-root')
            ->assertSee('game-shell')
            ->assertDontSee('id="navbar"', false);
    }
}
