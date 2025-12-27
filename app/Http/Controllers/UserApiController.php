<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserApiController extends Controller
{
    public function getUser()
    {
        $user = Auth::user();
        $userArray = $user->toArray();
        if ($userArray['gemini_api_key']) {
            $userArray['gemini_api_key'] = substr($userArray['gemini_api_key'], -4);
        }

        return response()->json($userArray);
    }

    public function updateEmail(Request $request)
    {
        $request->validate([
            'email' => ['required', 'email', Rule::unique('users')->ignore(Auth::id())],
        ]);

        Auth::user()->update(['email' => $request->email]);

        return response()->json(['message' => 'Email updated successfully']);
    }

    public function updatePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'password' => 'required|min:8|confirmed',
        ]);

        if (! Hash::check($request->current_password, Auth::user()->password)) {
            return response()->json(['message' => 'Current password is incorrect'], 422);
        }

        Auth::user()->update(['password' => Hash::make($request->password)]);

        return response()->json(['message' => 'Password updated successfully']);
    }

    public function updateApiKey(Request $request)
    {
        $request->validate([
            'gemini_api_key' => 'nullable|string',
        ]);

        Auth::user()->update(['gemini_api_key' => $request->gemini_api_key]);

        return response()->json(['message' => $request->gemini_api_key ? 'API key updated successfully' : 'API key cleared successfully']);
    }
}
