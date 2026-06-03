<?php

namespace App\Services\Auth;

use App\Models\LoginAuditLog;
use BWH\Auth\Contracts\AuthAuditLogger;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

class SharedAuthAuditLogger implements AuthAuditLogger
{
    public function passkeyRegistered(Request $request, Authenticatable $user, object $credential): void {}

    public function passkeyDeleted(Request $request, Authenticatable $user, object $credential): void {}

    public function passkeyLoginSucceeded(Request $request, Authenticatable $user, object $credential): void
    {
        $this->record($request, $user, $this->emailFor($user), true);
    }

    public function passkeyLoginFailed(Request $request, ?Authenticatable $user, ?string $credentialId, string $reason): void
    {
        $this->record($request, $user, $this->emailFor($user) ?? $credentialId, false);
    }

    public function twoFactorChallengeCreated(Request $request, Authenticatable $user, object $attempt): void {}

    public function twoFactorLoginSucceeded(Request $request, Authenticatable $user, object $attempt): void {}

    public function twoFactorLoginFailed(Request $request, ?Authenticatable $user, ?object $attempt, string $reason): void {}

    public function twoFactorReportedSuspicious(Request $request, Authenticatable $user, object $attempt): void {}

    public function passwordResetRequested(Request $request, Authenticatable $user): void {}

    public function passwordResetCompleted(Request $request, Authenticatable $user): void {}

    public function passwordChanged(Request $request, Authenticatable $user): void {}

    private function record(Request $request, ?Authenticatable $user, ?string $email, bool $success): void
    {
        LoginAuditLog::create([
            'user_id' => $user?->getAuthIdentifier(),
            'email' => $email,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => $success,
            'method' => 'passkey',
            'is_suspicious' => false,
        ]);
    }

    private function emailFor(?Authenticatable $user): ?string
    {
        return is_object($user) && isset($user->email) && is_string($user->email) ? $user->email : null;
    }
}
