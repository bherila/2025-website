<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class MasterPasswordLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Ensure we have a user to log in as
        User::factory()->create([
            'email' => 'test@example.com',
            'user_role' => 'user',
        ]);
    }

    /**
     * Test master password works when APP_ENV is local.
     */
    public function test_master_password_works_on_localhost(): void
    {
        Config::set('app.env', 'local');

        $response = $this->post('/login', [
            'email' => 'test@example.com',
            'password' => '1234567890',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();
    }

    /**
     * Test master password works when APP_URL contains localhost.
     */
    public function test_master_password_works_when_app_url_is_localhost(): void
    {
        Config::set('app.env', 'production');
        Config::set('app.url', 'http://localhost');

        $response = $this->post('/login', [
            'email' => 'test@example.com',
            'password' => '1234567890',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();
    }

    /**
     * Test master password does NOT work when NOT on localhost.
     */
    public function test_master_password_does_not_work_on_production(): void
    {
        Config::set('app.env', 'production');
        Config::set('app.url', 'https://example.com');

        $response = $this->post('/login', [
            'email' => 'test@example.com',
            'password' => '1234567890',
        ]);

        $response->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    /**
     * Test regular password still works.
     */
    public function test_regular_password_still_works(): void
    {
        Config::set('app.env', 'production');
        
        $user = User::factory()->create([
            'email' => 'real@example.com',
            'password' => bcrypt('secret123'),
            'user_role' => 'user',
        ]);

        $response = $this->post('/login', [
            'email' => 'real@example.com',
            'password' => 'secret123',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }
}
