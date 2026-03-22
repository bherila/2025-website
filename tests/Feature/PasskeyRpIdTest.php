<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PasskeyRpIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_rp_id_falls_back_to_request_host_when_app_url_is_localhost(): void
    {
        $user = User::factory()->create();
        
        // Ensure config is default
        config(['app.url' => 'http://localhost']);

        // Use a full URL to a production domain
        $response = $this->actingAs($user)
            ->post('https://production-app.com/api/passkeys/register/options');

        $response->assertStatus(200);
        $data = $response->json();
        
        // Should be 'production-app.com', NOT 'localhost'
        $this->assertEquals('production-app.com', $data['rp']['id']);
    }

    public function test_rp_id_uses_app_url_when_it_is_configured_correctly(): void
    {
        $user = User::factory()->create();
        
        config(['app.url' => 'https://my-actual-domain.com']);

        // Even if request host is different (e.g. proxy), it should prefer APP_URL
        $response = $this->actingAs($user)
            ->post('https://some-other-host.com/api/passkeys/register/options');

        $response->assertStatus(200);
        $data = $response->json();
        
        $this->assertEquals('my-actual-domain.com', $data['rp']['id']);
    }

    public function test_auth_rp_id_also_falls_back(): void
    {
        config(['app.url' => 'http://localhost']);

        $response = $this->post('https://production-app.com/api/passkeys/auth/options');

        $response->assertStatus(200);
        $data = $response->json();
        
        $this->assertEquals('production-app.com', $data['rpId']);
    }
}
