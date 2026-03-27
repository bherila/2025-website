<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class PasskeyRpIdTest extends TestCase
{
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

    public function test_rp_id_always_uses_request_host(): void
    {
        $user = User::factory()->create();

        // Even when APP_URL is set, the RP ID must come from the request host.
        // Using APP_URL would cause a mismatch when users access the site without
        // the "www." prefix (or vice-versa), making WebAuthn throw a silent
        // SecurityError in the browser.
        config(['app.url' => 'https://my-actual-domain.com']);

        $response = $this->actingAs($user)
            ->post('https://some-other-host.com/api/passkeys/register/options');

        $response->assertStatus(200);
        $data = $response->json();

        // RP ID must equal the request's host so the browser origin check passes.
        $this->assertEquals('some-other-host.com', $data['rp']['id']);
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
