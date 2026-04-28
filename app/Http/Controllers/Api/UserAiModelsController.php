<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Bherila\GenAiLaravel\Clients\AnthropicClient;
use Bherila\GenAiLaravel\Clients\BedrockClient;
use Bherila\GenAiLaravel\Clients\GeminiClient;
use Bherila\GenAiLaravel\Contracts\GenAiClient;
use Bherila\GenAiLaravel\Exceptions\GenAiFatalException;
use Bherila\GenAiLaravel\ModelInfo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class UserAiModelsController extends Controller
{
    public function fetch(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => ['required', 'string', 'in:gemini,anthropic,bedrock'],
            'api_key' => ['nullable', 'string'],
            'config_id' => ['nullable', 'integer'],
            'region' => ['nullable', 'string'],
            'session_token' => ['nullable', 'string'],
        ]);

        $provider = (string) $request->input('provider');
        $apiKey = $request->input('api_key');
        $apiKey = is_string($apiKey) ? $apiKey : null;

        // For edit flows, accept a config_id and reuse the saved key rather than
        // requiring the user to re-enter it.
        if (! $apiKey && $request->filled('config_id')) {
            $config = Auth::user()->aiConfigurations()->find($request->input('config_id'));
            if ($config) {
                $apiKey = $config->api_key;
            }
        }

        if (! $apiKey) {
            return response()->json(['error' => 'An API key is required to fetch models.'], 422);
        }

        $region = is_string($request->input('region')) ? $request->input('region') : 'us-east-1';
        $sessionToken = is_string($request->input('session_token')) ? $request->input('session_token') : '';

        try {
            $client = $this->makeClient($provider, $apiKey, $region, $sessionToken);

            if (! $client->checkCredentials()) {
                return response()->json(['error' => 'Invalid API credentials.'], 422);
            }

            /** @var ModelInfo[] $modelInfos */
            $modelInfos = $client->listModels();

            $models = array_values(array_map(
                fn (ModelInfo $m) => str_starts_with($m->id, 'models/') ? substr($m->id, 7) : $m->id,
                $modelInfos,
            ));

            return response()->json(['models' => $models]);
        } catch (GenAiFatalException $e) {
            Log::warning('Failed to fetch AI models', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['error' => 'Failed to fetch models. Please check your credentials and try again.'], 422);
        } catch (\Exception $e) {
            Log::warning('Failed to fetch AI models', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['error' => 'Failed to fetch models. Please check your credentials and try again.'], 422);
        }
    }

    private function makeClient(string $provider, string $apiKey, string $region, string $sessionToken): GenAiClient
    {
        return match ($provider) {
            'gemini' => new GeminiClient(apiKey: $apiKey),
            'anthropic' => new AnthropicClient(apiKey: $apiKey),
            'bedrock' => new BedrockClient(apiKey: $apiKey, modelId: 'any', region: $region, sessionToken: $sessionToken),
            default => throw new \InvalidArgumentException("Unsupported provider: {$provider}"),
        };
    }
}
