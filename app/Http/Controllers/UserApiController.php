<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserApiController extends Controller
{
    public function getUser()
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $userId = $user->id;

        return Cache::remember("user_data_{$userId}", 60, function () use ($user) {
            $userArray = $user->toArray();
            if (! empty($userArray['gemini_api_key'])) {
                $userArray['gemini_api_key'] = substr($userArray['gemini_api_key'], -4);
            }

            return $userArray;
        });
    }

    public function updateEmail(Request $request)
    {
        $request->validate([
            'email' => ['required', 'email', Rule::unique('users')->ignore(Auth::id())],
        ]);

        $user = Auth::user();
        $user->update(['email' => $request->email]);
        Cache::forget("user_data_{$user->id}");

        return response()->json(['message' => 'Email updated successfully']);
    }

    public function updatePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'password' => 'required|min:8|confirmed',
        ]);

        $user = Auth::user();
        if (! Hash::check($request->current_password, $user->password)) {
            return response()->json(['message' => 'Current password is incorrect'], 422);
        }

        $user->update(['password' => Hash::make($request->password)]);
        Cache::forget("user_data_{$user->id}");

        return response()->json(['message' => 'Password updated successfully']);
    }

    public function updateApiKey(Request $request)
    {
        $request->validate([
            'gemini_api_key' => 'nullable|string',
        ]);

        $user = Auth::user();
        $user->update(['gemini_api_key' => $request->gemini_api_key]);
        Cache::forget("user_data_{$user->id}");

        return response()->json(['message' => $request->gemini_api_key ? 'API key updated successfully' : 'API key cleared successfully']);
    }

    public function updateGenAiQuota(Request $request)
    {
        $request->validate([
            'genai_daily_quota_limit' => 'nullable|integer|min:1|max:10000',
        ]);

        $user = Auth::user();
        $user->update(['genai_daily_quota_limit' => $request->genai_daily_quota_limit]);
        Cache::forget("user_data_{$user->id}");

        $limit = $request->genai_daily_quota_limit;

        return response()->json([
            'message' => $limit ? "Daily quota limit set to {$limit}" : 'Daily quota limit reset to system default',
        ]);
    }
}
