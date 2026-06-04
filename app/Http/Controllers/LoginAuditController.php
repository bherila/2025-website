<?php

namespace App\Http\Controllers;

use BWH\Auth\Models\AuthAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LoginAuditController extends Controller
{
    private const LOGIN_EVENTS = [
        AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
        AuthAuditLog::EVENT_LOGIN_FAILED,
        AuthAuditLog::EVENT_LOGIN_BLOCKED,
        AuthAuditLog::EVENT_PASSKEY_LOGIN_SUCCEEDED,
        AuthAuditLog::EVENT_PASSKEY_LOGIN_FAILED,
    ];

    /**
     * List the authenticated user's login audit log.
     */
    public function index(Request $request): JsonResponse
    {
        $entries = AuthAuditLog::query()
            ->where('user_id', Auth::id())
            ->whereIn('event', self::LOGIN_EVENTS)
            ->orderBy('created_at', 'desc')
            ->paginate(20)
            ->through(fn (AuthAuditLog $entry): array => $this->toLegacyPayload($entry));

        return response()->json($entries);
    }

    /**
     * Mark a login audit entry as suspicious.
     */
    public function markSuspicious(int $id): JsonResponse
    {
        $entry = AuthAuditLog::query()
            ->where('id', $id)
            ->where('user_id', Auth::id())
            ->whereIn('event', self::LOGIN_EVENTS)
            ->firstOrFail();

        $entry->update(['is_suspicious' => ! $entry->is_suspicious]);

        return response()->json([
            'success' => true,
            'is_suspicious' => $entry->is_suspicious,
        ]);
    }

    /**
     * Preserve the existing React API while reading from the package audit model.
     *
     * @return array<string, mixed>
     */
    private function toLegacyPayload(AuthAuditLog $entry): array
    {
        return [
            'id' => $entry->id,
            'user_id' => $entry->user_id,
            'email' => $entry->email,
            'ip_address' => $entry->ip_address,
            'user_agent' => $entry->user_agent,
            'success' => $entry->succeeded,
            'method' => $entry->auth_method ?? $this->legacyMethodFor($entry),
            'is_suspicious' => $entry->is_suspicious,
            'created_at' => $entry->getAttribute('created_at'),
            'updated_at' => $entry->getAttribute('updated_at'),
        ];
    }

    private function legacyMethodFor(AuthAuditLog $entry): string
    {
        return str_starts_with($entry->event, 'passkey_') ? 'passkey' : 'password';
    }
}
