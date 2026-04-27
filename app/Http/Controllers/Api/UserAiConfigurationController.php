<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserAiConfigurationRequest;
use App\Models\UserAiConfiguration;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class UserAiConfigurationController extends Controller
{
    public function index(): JsonResponse
    {
        $configs = Auth::user()
            ->aiConfigurations()
            ->orderByDesc('is_active')
            ->orderBy('created_at')
            ->get()
            ->map(fn (UserAiConfiguration $c) => $c->toApiArray());

        return response()->json($configs);
    }

    public function store(UserAiConfigurationRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = Auth::user();

        $config = DB::transaction(function () use ($data, $user) {
            $config = $user->aiConfigurations()->create([
                'name' => $data['name'],
                'provider' => $data['provider'],
                'api_key' => $data['api_key'],
                'region' => $data['region'] ?? null,
                'session_token' => $data['session_token'] ?? null,
                'model' => $data['model'],
                'is_active' => false,
            ]);

            // Auto-activate if this is the first config
            if ($user->aiConfigurations()->count() === 1) {
                $config->update(['is_active' => true]);
            }

            return $config;
        });

        return response()->json($config->toApiArray(), 201);
    }

    public function update(UserAiConfigurationRequest $request, int $id): JsonResponse
    {
        $config = $this->findOwned($id);
        $data = $request->validated();

        $update = [
            'name' => $data['name'],
            'provider' => $data['provider'],
            'region' => $data['region'] ?? null,
            'session_token' => $data['session_token'] ?? null,
            'model' => $data['model'],
        ];

        if (! empty($data['api_key'])) {
            $update['api_key'] = $data['api_key'];
        }

        $config->update($update);

        return response()->json($config->toApiArray());
    }

    public function destroy(int $id): JsonResponse
    {
        $config = $this->findOwned($id);
        $wasActive = $config->is_active;

        DB::transaction(function () use ($config, $wasActive) {
            $config->delete();

            if ($wasActive) {
                // Promote the most recently created remaining config, if any
                Auth::user()->aiConfigurations()->latest()->first()?->update(['is_active' => true]);
            }
        });

        return response()->json(['success' => true]);
    }

    public function activate(int $id): JsonResponse
    {
        $config = $this->findOwned($id);

        DB::transaction(function () use ($config) {
            // Lock all of the user's configs so concurrent activate calls are serialized
            // (the partial unique index would otherwise reject the loser with a generic 500).
            Auth::user()->aiConfigurations()->lockForUpdate()->get();
            Auth::user()->aiConfigurations()->update(['is_active' => false]);
            $config->update(['is_active' => true]);
        });

        return response()->json($config->fresh()->toApiArray());
    }

    private function findOwned(int $id): UserAiConfiguration
    {
        /** @var UserAiConfiguration */
        return Auth::user()->aiConfigurations()->findOrFail($id);
    }
}
