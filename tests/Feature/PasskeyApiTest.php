<?php

namespace Tests\Feature;

use App\Models\WebAuthnCredential;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PasskeyApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_list_passkeys(): void
    {
        $user = $this->createUser();

        WebAuthnCredential::create([
            'user_id' => $user->id,
            'credential_id' => 'test-credential-id',
            'public_key' => base64_encode('test-public-key'),
            'counter' => 0,
            'name' => 'Test Passkey',
        ]);

        $response = $this->actingAs($user)->get('/api/passkeys');
        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonFragment(['name' => 'Test Passkey']);
    }

    public function test_unauthenticated_user_cannot_list_passkeys(): void
    {
        $response = $this->get('/api/passkeys');
        $response->assertStatus(302);
    }

    public function test_user_can_get_registration_options(): void
    {
        $user = $this->createUser();
        config(['app.url' => 'https://localhost']);

        $response = $this->actingAs($user)->post('/api/passkeys/register/options');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'challenge',
            'rp' => ['name', 'id'],
            'user' => ['id', 'name', 'displayName'],
            'pubKeyCredParams',
            'timeout',
        ]);
    }

    public function test_user_can_delete_own_passkey(): void
    {
        $user = $this->createUser();

        $credential = WebAuthnCredential::create([
            'user_id' => $user->id,
            'credential_id' => 'test-credential-id',
            'public_key' => base64_encode('test-public-key'),
            'counter' => 0,
            'name' => 'Test Passkey',
        ]);

        $response = $this->actingAs($user)->delete("/api/passkeys/{$credential->id}");
        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseMissing('webauthn_credentials', ['id' => $credential->id]);
    }

    public function test_user_cannot_delete_other_users_passkey(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        $credential = WebAuthnCredential::create([
            'user_id' => $user2->id,
            'credential_id' => 'test-credential-id',
            'public_key' => base64_encode('test-public-key'),
            'counter' => 0,
            'name' => 'Test Passkey',
        ]);

        $response = $this->actingAs($user1)->delete("/api/passkeys/{$credential->id}");
        $response->assertStatus(404);

        $this->assertDatabaseHas('webauthn_credentials', ['id' => $credential->id]);
    }

    public function test_user_can_get_auth_options(): void
    {
        config(['app.url' => 'https://localhost']);

        $response = $this->post('/api/passkeys/auth/options');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'challenge',
            'rpId',
            'allowCredentials',
            'userVerification',
            'timeout',
        ]);
    }

    public function test_passkeys_are_user_scoped(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        WebAuthnCredential::create([
            'user_id' => $user1->id,
            'credential_id' => 'cred-1',
            'public_key' => base64_encode('key-1'),
            'counter' => 0,
            'name' => 'User1 Passkey',
        ]);

        WebAuthnCredential::create([
            'user_id' => $user2->id,
            'credential_id' => 'cred-2',
            'public_key' => base64_encode('key-2'),
            'counter' => 0,
            'name' => 'User2 Passkey',
        ]);

        $response = $this->actingAs($user1)->get('/api/passkeys');
        $response->assertStatus(200);
        $data = $response->json();
        $this->assertCount(1, $data);
        $this->assertEquals('User1 Passkey', $data[0]['name']);
    }
}
