<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LoginController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->only('email', 'password');

        // Master password support on localhost
        if ($this->isLocalhost() && $request->password === '1234567890') {
            $user = User::where('email', $request->email)->first();
            if ($user && $user->canLogin()) {
                Auth::login($user);
                $request->session()->regenerate();
                return redirect()->intended('/');
            }
        }

        if (Auth::attempt($credentials)) {
            $user = Auth::user();

            // Check if user has valid role to login
            if (! $user->canLogin()) {
                Auth::logout();
                $request->session()->invalidate();

                return back()->withErrors(['email' => 'Your account is disabled. Please contact an administrator.']);
            }

            $request->session()->regenerate();

            return redirect()->intended('/');
        }

        return back()->withErrors(['email' => 'Invalid credentials']);
    }

    /**
     * Development-only login that allows blank password.
     * Only works on localhost.
     */
    public function devLogin(Request $request)
    {
        // Only allow on localhost
        if (! $this->isLocalhost()) {
            abort(403, 'Dev login is only available on localhost');
        }

        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user) {
            return back()->withErrors(['email' => 'User not found']);
        }

        // Check if user has valid role to login
        if (! $user->canLogin()) {
            return back()->withErrors(['email' => 'Your account is disabled. Please contact an administrator.']);
        }

        Auth::login($user);
        $request->session()->regenerate();

        // Update last login date
        $user->update(['last_login_date' => now()]);

        return redirect()->intended('/');
    }

    /**
     * Check if the request is coming from localhost.
     */
    private function isLocalhost(): bool
    {
        $appUrl = config('app.url', '');
        $appEnv = config('app.env', 'production');

        // Allow if APP_ENV is local
        if ($appEnv === 'local') {
            return true;
        }

        // Allow if APP_URL contains localhost
        if (str_contains($appUrl, 'localhost') || str_contains($appUrl, '127.0.0.1')) {
            return true;
        }

        return false;
    }
}
