<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTitleTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_settings_page_has_title(): void
    {
        $this->withoutVite();

        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/dashboard');

        $response->assertStatus(200);
        $response->assertSee('<title>User Settings | '.config('app.name', 'Ben Herila').'</title>', false);
    }
}
