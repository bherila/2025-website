<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UserAiModelsController extends Controller
{
    private const INVALID_CREDENTIALS_ERROR = 'Invalid API credentials.';

    private const FETCH_MODELS_ERROR = 'Failed to fetch models. Please check your credentials and try again.';

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
            $models = $this->listModels($provider, $apiKey, $region, $sessionToken);

            return response()->json(['models' => $models]);
        } catch (\UnexpectedValueException $e) {
            Log::warning('Failed to fetch AI models', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['error' => self::INVALID_CREDENTIALS_ERROR], 422);
        } catch (\Exception $e) {
            Log::warning('Failed to fetch AI models', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['error' => self::FETCH_MODELS_ERROR], 422);
        }
    }

    /**
     * @return list<string>
     */
    private function listModels(string $provider, string $apiKey, string $region, string $sessionToken): array
    {
        return match ($provider) {
            'gemini' => $this->listGeminiModels($apiKey),
            'anthropic' => $this->listAnthropicModels($apiKey),
            'bedrock' => $this->listBedrockModels($apiKey, $region, $sessionToken),
            default => throw new \InvalidArgumentException("Unsupported provider: {$provider}"),
        };
    }

    /**
     * @return list<string>
     */
    private function listGeminiModels(string $apiKey): array
    {
        $request = Http::withHeaders(['x-goog-api-key' => $apiKey]);
        $this->ensureCredentialsAreValid($request->get('https://generativelanguage.googleapis.com/v1beta/models'));

        $response = $request->get('https://generativelanguage.googleapis.com/v1beta/models');
        $this->ensureCredentialsAreValid($response);

        $models = $response->json('models');
        if (! is_array($models)) {
            return [];
        }

        $modelIds = [];
        foreach ($models as $model) {
            if (! is_array($model)) {
                continue;
            }

            $supportedGenerationMethods = $model['supportedGenerationMethods'] ?? [];
            if (is_array($supportedGenerationMethods) && ! in_array('generateContent', $supportedGenerationMethods, true)) {
                continue;
            }

            $modelName = $model['name'] ?? null;
            if (is_string($modelName)) {
                $modelIds[] = $this->normalizeGeminiModelId($modelName);
            }
        }

        return $modelIds;
    }

    /**
     * @return list<string>
     */
    private function listAnthropicModels(string $apiKey): array
    {
        $request = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ]);

        $this->ensureCredentialsAreValid($request->get('https://api.anthropic.com/v1/models'));

        $response = $request->get('https://api.anthropic.com/v1/models');
        $this->ensureCredentialsAreValid($response);

        $models = $response->json('data');
        if (! is_array($models)) {
            return [];
        }

        $modelIds = [];
        foreach ($models as $model) {
            if (is_array($model) && is_string($model['id'] ?? null)) {
                $modelIds[] = $model['id'];
            }
        }

        return $modelIds;
    }

    /**
     * @return list<string>
     */
    private function listBedrockModels(string $apiKey, string $region, string $sessionToken): array
    {
        $headers = [];
        if ($sessionToken !== '') {
            $headers['X-Amz-Security-Token'] = $sessionToken;
        }

        $request = Http::withToken($apiKey)->withHeaders($headers);
        $foundationModelsUrl = "https://bedrock.{$region}.amazonaws.com/foundation-models";

        $this->ensureCredentialsAreValid($request->get($foundationModelsUrl));

        $foundationModelsResponse = $request->get($foundationModelsUrl);
        $this->ensureCredentialsAreValid($foundationModelsResponse);

        $inferenceProfilesResponse = $request->get("https://bedrock.{$region}.amazonaws.com/inference-profiles");
        $this->ensureCredentialsAreValid($inferenceProfilesResponse);

        return [
            ...$this->pluckModelIds($foundationModelsResponse, 'modelSummaries', 'modelId'),
            ...$this->pluckModelIds($inferenceProfilesResponse, 'inferenceProfileSummaries', 'inferenceProfileId'),
        ];
    }

    private function ensureCredentialsAreValid(Response $response): void
    {
        if (! $response->successful()) {
            throw new \UnexpectedValueException(self::INVALID_CREDENTIALS_ERROR);
        }
    }

    private function normalizeGeminiModelId(string $modelName): string
    {
        return str_starts_with($modelName, 'models/') ? substr($modelName, 7) : $modelName;
    }

    /**
     * @return list<string>
     */
    private function pluckModelIds(Response $response, string $collectionKey, string $idKey): array
    {
        $models = $response->json($collectionKey);
        if (! is_array($models)) {
            return [];
        }

        $modelIds = [];
        foreach ($models as $model) {
            if (is_array($model) && is_string($model[$idKey] ?? null)) {
                $modelIds[] = $model[$idKey];
            }
        }

        return $modelIds;
    }
}
