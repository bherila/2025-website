<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UserAiModelsController extends Controller
{
    public function fetch(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => ['required', 'string', 'in:gemini,anthropic,bedrock'],
            'api_key' => ['required', 'string'],
            'region' => ['nullable', 'string'],
            'session_token' => ['nullable', 'string'],
        ]);

        $provider = $request->input('provider');
        $apiKey = $request->input('api_key');

        try {
            $models = match ($provider) {
                'gemini' => $this->fetchGeminiModels($apiKey),
                'anthropic' => $this->fetchAnthropicModels($apiKey),
                'bedrock' => $this->fetchBedrockModels($apiKey, $request->input('region', 'us-east-1'), $request->input('session_token')),
            };

            return response()->json(['models' => $models]);
        } catch (\Exception $e) {
            Log::warning('Failed to fetch AI models', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** @return list<string> */
    private function fetchGeminiModels(string $apiKey): array
    {
        $response = Http::timeout(10)->get('https://generativelanguage.googleapis.com/v1beta/models', [
            'key' => $apiKey,
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Gemini API error: '.$response->body());
        }

        return collect($response->json('models', []))
            ->filter(fn ($m) => in_array('generateContent', $m['supportedGenerationMethods'] ?? [], true))
            ->pluck('name')
            ->map(fn ($n) => str_replace('models/', '', $n))
            ->values()
            ->all();
    }

    /** @return list<string> */
    private function fetchAnthropicModels(string $apiKey): array
    {
        $response = Http::timeout(10)->withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ])->get('https://api.anthropic.com/v1/models');

        if (! $response->successful()) {
            throw new \RuntimeException('Anthropic API error: '.$response->body());
        }

        return collect($response->json('data', []))
            ->pluck('id')
            ->values()
            ->all();
    }

    /** @return list<string> */
    private function fetchBedrockModels(string $apiKey, string $region, ?string $sessionToken): array
    {
        // Bedrock requires AWS SDK; hit the REST endpoint directly using SigV4 would be complex,
        // so we return a curated list of known on-demand models for now.
        // This can be replaced with SDK-based listing when AWS SDK is added as a dependency.
        return [
            'anthropic.claude-opus-4-7',
            'anthropic.claude-sonnet-4-6',
            'anthropic.claude-haiku-4-5-20251001',
            'amazon.titan-text-premier-v1:0',
            'amazon.titan-text-express-v1',
            'meta.llama3-70b-instruct-v1:0',
            'meta.llama3-8b-instruct-v1:0',
        ];
    }
}
