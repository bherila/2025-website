<?php

namespace App\Services;

use Bherila\GenAiLaravel\Clients\AnthropicClient;
use Bherila\GenAiLaravel\Clients\BedrockClient;
use Bherila\GenAiLaravel\Clients\GeminiClient;
use Bherila\GenAiLaravel\Contracts\GenAiClient;
use Bherila\GenAiLaravel\Exceptions\GenAiFatalException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class UserAiModelCatalog
{
    /**
     * @return list<string>
     */
    public function listModels(string $provider, string $apiKey, string $region = 'us-east-1', string $sessionToken = ''): array
    {
        $client = $this->makeClient($provider, $apiKey, $region, $sessionToken);
        if (in_array('listModels', get_class_methods($client), true)) {
            /** @var mixed $modelInfos */
            $modelInfos = call_user_func([$client, 'listModels']);

            return $this->normalizeModelInfoList($modelInfos);
        }

        return match ($provider) {
            'gemini' => $this->listGeminiModels($apiKey),
            'anthropic' => $this->listAnthropicModels($apiKey),
            'bedrock' => $this->listBedrockModels($apiKey, $region, $sessionToken),
            default => throw new \InvalidArgumentException("Unsupported provider: {$provider}"),
        };
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

    /**
     * @return list<string>
     */
    private function listGeminiModels(string $apiKey): array
    {
        $response = Http::withHeaders(['x-goog-api-key' => $apiKey])
            ->get('https://generativelanguage.googleapis.com/v1beta/models');
        $this->ensureResponseSuccessful($response, 'gemini');

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
        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ])->get('https://api.anthropic.com/v1/models');
        $this->ensureResponseSuccessful($response, 'anthropic');

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

        $foundationModelsResponse = $request->get("https://bedrock.{$region}.amazonaws.com/foundation-models");
        $this->ensureResponseSuccessful($foundationModelsResponse, 'bedrock');

        $inferenceProfilesResponse = $request->get("https://bedrock.{$region}.amazonaws.com/inference-profiles");
        $this->ensureResponseSuccessful($inferenceProfilesResponse, 'bedrock');

        return [
            ...$this->pluckModelIds($foundationModelsResponse, 'modelSummaries', 'modelId'),
            ...$this->pluckModelIds($inferenceProfilesResponse, 'inferenceProfileSummaries', 'inferenceProfileId'),
        ];
    }

    private function ensureResponseSuccessful(Response $response, string $provider): void
    {
        if (! $response->successful()) {
            throw new GenAiFatalException("{$provider} model listing failed: ".$response->body());
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

    /**
     * @return list<string>
     */
    private function normalizeModelInfoList(mixed $modelInfos): array
    {
        if (! is_iterable($modelInfos)) {
            return [];
        }

        $modelIds = [];
        foreach ($modelInfos as $modelInfo) {
            $modelId = null;
            if (is_object($modelInfo) && isset($modelInfo->id) && is_string($modelInfo->id)) {
                $modelId = $modelInfo->id;
            } elseif (is_array($modelInfo) && is_string($modelInfo['id'] ?? null)) {
                $modelId = $modelInfo['id'];
            }

            if ($modelId !== null) {
                $modelIds[] = $this->normalizeGeminiModelId($modelId);
            }
        }

        return $modelIds;
    }
}
