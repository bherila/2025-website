<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserAiConfiguration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UserAiModelsControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Auth ─────────────────────────────────────────────────────────────────

    public function test_fetch_requires_auth(): void
    {
        $this->postJson('/api/user/ai-prefs/models')->assertStatus(401);
    }

    // ── Validation ────────────────────────────────────────────────────────────

    public function test_fetch_validates_provider(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'unknown',
            'api_key' => 'key',
        ])->assertUnprocessable()->assertJsonValidationErrors(['provider']);
    }

    public function test_fetch_returns_422_when_no_api_key(): void
    {
        $user = User::factory()->create();

        Http::fake();

        $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'gemini',
        ])->assertUnprocessable()->assertJsonFragment(['error' => 'An API key is required to fetch models.']);
    }

    // ── Gemini ────────────────────────────────────────────────────────────────

    public function test_fetch_gemini_models_with_valid_key(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models*' => Http::response([
                'models' => [
                    ['name' => 'models/gemini-2.0-flash', 'supportedGenerationMethods' => ['generateContent']],
                    ['name' => 'models/gemini-1.5-pro', 'supportedGenerationMethods' => ['generateContent']],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'gemini',
            'api_key' => 'valid-key',
        ]);

        $response->assertOk();
        $models = $response->json('models');
        $this->assertContains('gemini-2.0-flash', $models);
        $this->assertContains('gemini-1.5-pro', $models);
        $this->assertNotContains('models/gemini-2.0-flash', $models);
    }

    public function test_fetch_gemini_returns_422_for_invalid_credentials(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models*' => Http::response([
                'error' => ['message' => 'API key not valid. Please pass a valid API key.'],
            ], 401),
        ]);

        $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'gemini',
            'api_key' => 'bad-key',
        ])->assertUnprocessable()->assertJsonFragment(['error' => 'Invalid API credentials.']);
    }

    // ── Anthropic ─────────────────────────────────────────────────────────────

    public function test_fetch_anthropic_models_with_valid_key(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'api.anthropic.com/v1/models*' => Http::response([
                'data' => [
                    ['id' => 'claude-sonnet-4-6', 'display_name' => 'Claude Sonnet 4.6'],
                    ['id' => 'claude-haiku-4-5', 'display_name' => 'Claude Haiku 4.5'],
                ],
                'has_more' => false,
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'anthropic',
            'api_key' => 'valid-key',
        ]);

        $response->assertOk();
        $models = $response->json('models');
        $this->assertContains('claude-sonnet-4-6', $models);
        $this->assertContains('claude-haiku-4-5', $models);
    }

    public function test_fetch_anthropic_returns_422_for_invalid_credentials(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'api.anthropic.com/v1/models*' => Http::response([
                'error' => ['message' => 'invalid x-api-key'],
            ], 401),
        ]);

        $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'anthropic',
            'api_key' => 'bad-key',
        ])->assertUnprocessable()->assertJsonFragment(['error' => 'Invalid API credentials.']);
    }

    // ── Bedrock ───────────────────────────────────────────────────────────────

    public function test_fetch_bedrock_models_with_valid_key(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'bedrock.us-east-1.amazonaws.com/foundation-models' => Http::response([
                'modelSummaries' => [
                    ['modelId' => 'anthropic.claude-3-5-sonnet-20241022-v2:0', 'modelName' => 'Claude 3.5 Sonnet'],
                ],
            ], 200),
            'bedrock.us-east-1.amazonaws.com/inference-profiles' => Http::response(['inferenceProfileSummaries' => []], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'bedrock',
            'api_key' => 'valid-key',
            'region' => 'us-east-1',
        ]);

        $response->assertOk();
        $this->assertContains('anthropic.claude-3-5-sonnet-20241022-v2:0', $response->json('models'));
    }

    // ── config_id key fallback ────────────────────────────────────────────────

    public function test_fetch_uses_saved_key_when_config_id_provided(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create(['api_key' => 'saved-key']);

        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models*' => Http::response([
                'models' => [
                    ['name' => 'models/gemini-2.0-flash', 'supportedGenerationMethods' => ['generateContent']],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'gemini',
            'config_id' => $config->id,
        ]);

        $response->assertOk();
        $this->assertContains('gemini-2.0-flash', $response->json('models'));
    }

    public function test_successful_fetch_with_config_id_clears_invalid_api_key_marker(): void
    {
        $user = User::factory()->create();
        $config = UserAiConfiguration::factory()->for($user)->gemini()->create(['api_key' => 'saved-key']);
        $config->markApiKeyInvalid('API key not valid');

        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models*' => Http::response([
                'models' => [
                    ['name' => 'models/gemini-2.0-flash', 'supportedGenerationMethods' => ['generateContent']],
                ],
            ], 200),
        ]);

        $this->actingAs($user)->postJson('/api/user/ai-prefs/models', [
            'provider' => 'gemini',
            'config_id' => $config->id,
        ])->assertOk();

        $config->refresh();
        $this->assertFalse($config->hasInvalidApiKey());
        $this->assertNull($config->api_key_invalid_reason);
    }
}
