<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UserAiModelsController extends Controller
{
    public function fetch(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => ['required', 'string', 'in:gemini,anthropic'],
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

        try {
            $models = match ($provider) {
                'gemini' => $this->fetchGeminiModels($apiKey),
                'anthropic' => $this->fetchAnthropicModels($apiKey),
                default => throw new \InvalidArgumentException("Unsupported provider: {$provider}"),
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

        /** @var array<int, array<string, mixed>> $models */
        $models = $response->json('models', []) ?? [];

        return collect($models)
            ->filter(fn (array $m) => in_array('generateContent', $m['supportedGenerationMethods'] ?? [], true))
            ->pluck('name')
            ->map(fn ($n) => str_replace('models/', '', (string) $n))
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

        /** @var array<int, array<string, mixed>> $data */
        $data = $response->json('data', []) ?? [];

        return collect($data)
            ->pluck('id')
            ->values()
            ->all();
    }
}
