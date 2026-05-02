<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserAiConfiguration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UserAiConfigurationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake(function (Request $request) {
            $headers = json_encode($request->headers());
            if (is_string($headers) && str_contains($headers, 'bad-key')) {
                return Http::response([
                    'error' => ['message' => 'API key not valid. Please pass a valid API key.'],
                ], 401);
            }

            if (str_contains($request->url(), 'generativelanguage.googleapis.com')) {
                return Http::response([
                    'models' => [
                        ['name' => 'models/gemini-2.0-flash', 'supportedGenerationMethods' => ['generateContent']],
                        ['name' => 'models/gemini-1.5-pro', 'supportedGenerationMethods' => ['generateContent']],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), 'api.anthropic.com')) {
                return Http::response([
                    'data' => [
                        ['id' => 'claude-sonnet-4-6', 'display_name' => 'Claude Sonnet 4.6'],
                        ['id' => 'claude-haiku-4-5', 'display_name' => 'Claude Haiku 4.5'],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), '/foundation-models')) {
                return Http::response([
                    'modelSummaries' => [
                        ['modelId' => 'anthropic.claude-sonnet-4-6', 'modelName' => 'Claude Sonnet'],
                    ],
                ], 200);
            }

            if (str_contains($request->url(), '/inference-profiles')) {
                return Http::response([
                    'inferenceProfileSummaries' => [],
                ], 200);
            }

            return Http::response([], 404);
        });
    }

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
            ->assertJsonFragment(['name' => 'My Gemini', 'provider' => 'gemini'])
            ->assertJsonFragment(['available_models' => ['gemini-2.0-flash', 'gemini-1.5-pro']]);

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

    public function test_store_can_create_configuration_after_key_validation_before_model_is_selected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'My Gemini',
            'provider' => 'gemini',
            'api_key' => 'fake-api-key',
        ])->assertCreated()
            ->assertJsonFragment([
                'name' => 'My Gemini',
                'provider' => 'gemini',
                'model' => 'gemini-2.0-flash',
            ]);

        $this->assertDatabaseHas('user_ai_configurations', [
            'user_id' => $user->id,
            'name' => 'My Gemini',
            'model' => 'gemini-2.0-flash',
        ]);
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

    public function test_update_with_new_api_key_validates_credentials_and_returns_models(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create(['name' => 'Old name']);

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => 'New name',
            'provider' => 'gemini',
            'api_key' => 'new-key',
            'model' => 'gemini-2.0-flash',
        ])->assertOk()
            ->assertJsonFragment(['name' => 'New name'])
            ->assertJsonFragment(['available_models' => ['gemini-2.0-flash', 'gemini-1.5-pro']]);
    }

    public function test_update_cannot_change_provider(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create();

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => $config->name,
            'provider' => 'anthropic',
            'model' => 'claude-sonnet-4-6',
        ])->assertUnprocessable()
            ->assertJsonFragment(['error' => 'Provider cannot be changed after an API key configuration is created.']);

        $this->assertDatabaseHas('user_ai_configurations', [
            'id' => $config->id,
            'provider' => 'gemini',
        ]);
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
            ->assertJsonValidationErrors(['name', 'provider', 'api_key']);
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

    // --- expires_at ---

    public function test_store_accepts_future_expiry_date(): void
    {
        $user = User::factory()->create();
        $futureExpiry = now()->addYear();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'Expiring Key',
            'provider' => 'gemini',
            'api_key' => 'fake-key',
            'model' => 'gemini-2.0-flash',
            'expires_at' => $futureExpiry->toDateString(),
        ])->assertCreated()->assertJsonFragment(['expires_at' => $futureExpiry->copy()->startOfDay()->toIso8601String()]);
    }

    public function test_store_rejects_past_expiry_date(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'Old Key',
            'provider' => 'gemini',
            'api_key' => 'fake-key',
            'model' => 'gemini-2.0-flash',
            'expires_at' => now()->subDay()->toDateString(),
        ])->assertUnprocessable()->assertJsonValidationErrors(['expires_at']);
    }

    public function test_update_can_clear_expiry_date(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->expiredAt(now()->addMonth())->create();

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => $config->name,
            'provider' => 'gemini',
            'model' => 'gemini-2.0-flash',
        ])->assertOk()->assertJsonFragment(['expires_at' => null]);
    }

    public function test_is_expired_flag_is_true_for_past_expiry(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->active()->for($user)->gemini()
            ->expiredAt(now()->subDay())
            ->create();

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');
        $response->assertOk();
        $this->assertTrue($response->json('0.is_expired'));
    }

    public function test_is_expired_flag_is_false_for_future_expiry(): void
    {
        $user = User::factory()->create();
        UserAiConfiguration::factory()->active()->for($user)->gemini()
            ->expiredAt(now()->addYear())
            ->create();

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');
        $response->assertOk();
        $this->assertFalse($response->json('0.is_expired'));
    }

    public function test_is_expired_flag_is_false_when_no_expiry(): void
    {
        $user = User::factory()->create();
        UserAiConfiguration::factory()->active()->for($user)->gemini()->create();

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');
        $response->assertOk();
        $this->assertFalse($response->json('0.is_expired'));
    }

    // --- invalid API keys ---

    public function test_index_returns_invalid_api_key_fields(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->active()->for($user)->gemini()->create();
        $config->markApiKeyInvalid('Invalid API Key format');

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');

        $response->assertOk();
        $this->assertTrue($response->json('0.has_invalid_api_key'));
        $this->assertNotNull($response->json('0.api_key_invalid_at'));
        $this->assertSame('Invalid API Key format', $response->json('0.api_key_invalid_reason'));
    }

    public function test_update_with_new_api_key_clears_invalid_api_key_fields(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->active()->for($user)->gemini()->create();
        $config->markApiKeyInvalid('Invalid API Key format');

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => $config->name,
            'provider' => 'gemini',
            'api_key' => 'fixed-key',
            'model' => 'gemini-2.0-flash',
        ])->assertOk()->assertJsonFragment(['has_invalid_api_key' => false]);

        $this->assertDatabaseHas('user_ai_configurations', [
            'id' => $config->id,
            'api_key_invalid_at' => null,
            'api_key_invalid_reason' => null,
        ]);
    }

    public function test_store_rejects_invalid_api_key_credentials(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs', [
            'name' => 'Bad key',
            'provider' => 'gemini',
            'api_key' => 'bad-key',
        ])->assertUnprocessable()
            ->assertJsonFragment(['error' => 'Invalid API credentials.']);

        $this->assertDatabaseMissing('user_ai_configurations', [
            'user_id' => $user->id,
            'name' => 'Bad key',
        ]);
    }

    public function test_update_rejects_invalid_new_api_key_credentials(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create(['api_key' => 'old-key']);

        $this->actingAs($user)->putJson("/api/user/ai-prefs/{$config->id}", [
            'name' => $config->name,
            'provider' => 'gemini',
            'api_key' => 'bad-key',
            'model' => 'gemini-2.0-flash',
        ])->assertUnprocessable()
            ->assertJsonFragment(['error' => 'Invalid API credentials.']);

        $config->refresh();
        $this->assertSame('old-key', $config->api_key);
    }

    public function test_activate_rejects_invalid_api_key_configuration(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create();
        $config->markApiKeyInvalid('Invalid API Key format');

        $this->actingAs($user)->postJson("/api/user/ai-prefs/{$config->id}/activate", [])
            ->assertUnprocessable()
            ->assertJsonFragment(['error' => 'This API key has been marked invalid. Edit the configuration with a valid key before activating it.']);
    }

    public function test_activate_rejects_expired_configuration(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()
            ->expiredAt(now()->subDay())
            ->create();

        $this->actingAs($user)->postJson("/api/user/ai-prefs/{$config->id}/activate", [])
            ->assertUnprocessable()
            ->assertJsonFragment(['error' => 'This API key has expired. Edit the configuration before activating it.']);
    }

    // --- usage stats ---

    public function test_index_returns_usage_stats_field(): void
    {
        $user = User::factory()->create();
        UserAiConfiguration::factory()->active()->for($user)->gemini()->create();

        $response = $this->actingAs($user)->getJson('/api/user/ai-prefs');
        $response->assertOk();

        $usage = $response->json('0.usage');
        $this->assertIsArray($usage);
        $this->assertArrayHasKey('this_month', $usage);
        $this->assertArrayHasKey('total', $usage);
        $this->assertSame(0, $usage['this_month']['input_tokens']);
        $this->assertSame(0, $usage['this_month']['output_tokens']);
        $this->assertSame(0, $usage['total']['input_tokens']);
        $this->assertSame(0, $usage['total']['output_tokens']);
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

    public function test_resolved_ai_client_returns_null_for_expired_active_config(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);
        UserAiConfiguration::factory()->active()->gemini()->for($user)
            ->expiredAt(now()->subDay())
            ->create();

        $this->assertNull($user->resolvedAiClient());
    }

    public function test_resolved_ai_client_returns_null_for_invalid_active_config(): void
    {
        $user = User::factory()->create(['gemini_api_key' => null]);
        $config = UserAiConfiguration::factory()->active()->gemini()->for($user)->create();
        $config->markApiKeyInvalid('Invalid API Key format');

        $this->assertNull($user->resolvedAiClient());
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
