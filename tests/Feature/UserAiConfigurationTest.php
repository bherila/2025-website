<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserAiConfiguration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAiConfigurationTest extends TestCase
{
    use RefreshDatabase;

    // --- Auth guard ---

    public function test_index_requires_auth(): void
    {
        $this->getJson('/api/user/ai-prefs')->assertStatus(401);
    }

    public function test_store_requires_auth(): void
    {
        $this->postJson('/api/user/ai-prefs', [])->assertStatus(401);
    }

    // --- CRUD ---

    public function test_index_returns_empty_list_for_new_user(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/user/ai-prefs')
            ->assertOk()
            ->assertJson([]);
    }

    public function test_store_creates_configuration(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'My Gemini',
            'provider' => 'gemini',
            'api_key' => 'fake-api-key',
            'model' => 'gemini-2.0-flash',
        ])->assertCreated()
            ->assertJsonFragment(['name' => 'My Gemini', 'provider' => 'gemini']);

        $this->assertDatabaseHas('user_ai_configurations', [
            'user_id' => $user->id,
            'name' => 'My Gemini',
            'provider' => 'gemini',
            'model' => 'gemini-2.0-flash',
        ]);
    }

    public function test_first_config_is_auto_activated(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'First',
            'provider' => 'gemini',
            'api_key' => 'fake-key',
            'model' => 'gemini-2.0-flash',
        ])->assertCreated()->assertJsonFragment(['is_active' => true]);
    }

    public function test_second_config_is_not_auto_activated(): void
    {
        $user = User::factory()->create();
        UserAiConfiguration::factory()->active()->for($user)->gemini()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'Second',
            'provider' => 'anthropic',
            'api_key' => 'another-key',
            'model' => 'claude-sonnet-4-6',
        ])->assertCreated()->assertJsonFragment(['is_active' => false]);
    }

    public function test_update_configuration(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create(['name' => 'Old name']);

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => 'New name',
            'provider' => 'gemini',
            'model' => 'gemini-2.0-flash',
        ])->assertOk()->assertJsonFragment(['name' => 'New name']);
    }

    public function test_update_cannot_access_other_users_config(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($owner)->gemini()->create();

        $this->actingAs($other)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => 'Hacked',
            'provider' => 'gemini',
            'model' => 'gemini-2.0-flash',
        ])->assertNotFound();
    }

    public function test_destroy_deletes_configuration(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create();

        $this->actingAs($user)->deleteJson("/api/user/ai-prefs/{$config->id}")
            ->assertOk();

        $this->assertDatabaseMissing('user_ai_configurations', ['id' => $config->id]);
    }

    public function test_destroy_cannot_delete_other_users_config(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($owner)->gemini()->create();

        $this->actingAs($other)->deleteJson("/api/user/ai-prefs/{$config->id}")
            ->assertNotFound();
    }

    public function test_activate_sets_config_as_active_and_deactivates_others(): void
    {
        $user = User::factory()->create();
        $active = UserAiConfiguration::factory()->active()->for($user)->gemini()->create();
        $inactive = UserAiConfiguration::factory()->for($user)->anthropic()->create();

        $this->actingAs($user)->postJson("/api/user/ai-prefs/{$inactive->id}/activate", [])
            ->assertOk()->assertJsonFragment(['is_active' => true, 'id' => $inactive->id]);

        $this->assertDatabaseHas('user_ai_configurations', ['id' => $inactive->id, 'is_active' => true]);
        $this->assertDatabaseHas('user_ai_configurations', ['id' => $active->id, 'is_active' => false]);
    }

    public function test_activate_cannot_target_other_users_config(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($owner)->gemini()->create();

        $this->actingAs($other)->postJson("/api/user/ai-prefs/{$config->id}/activate", [])
            ->assertNotFound();
    }

    public function test_store_validates_required_fields(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'provider', 'api_key', 'model']);
    }

    public function test_store_validates_provider_enum(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'Test',
            'provider' => 'invalid-provider',
            'api_key' => 'key',
            'model' => 'some-model',
        ])->assertUnprocessable()->assertJsonValidationErrors(['provider']);
    }

    // --- resolvedAiClient ---

    public function test_resolved_ai_client_returns_null_when_no_config_and_no_legacy_key(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);
        $this->assertNull($user->resolvedAiClient());
    }

    public function test_resolved_ai_client_falls_back_to_legacy_gemini_key(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'legacy-key']);
        $client = $user->resolvedAiClient();
        $this->assertNotNull($client);
        $this->assertSame('gemini', $client->provider());
    }

    public function test_resolved_ai_client_uses_active_configuration_over_legacy_key(): void
    {
        $user = User::factory()->create(['gemini_api_key' => 'legacy-key']);
        UserAiConfiguration::factory()->active()->anthropic()->for($user)->create();

        $client = $user->resolvedAiClient();
        $this->assertNotNull($client);
        $this->assertSame('anthropic', $client->provider());
    }

    public function test_index_masks_api_key(): void
    {
        $user = User::factory()->create();
        UserAiConfiguration::factory()->for($user)->gemini()->create(['api_key' => 'supersecretkey1234']);

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');
        $response->assertOk();
        $data = $response->json();
        $this->assertStringNotContainsString('supersecretkey1234', json_encode($data));
        $this->assertStringContainsString('1234', $data[0]['masked_key']);
    }
}
