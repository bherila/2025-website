<?php

namespace App\Http\Controllers;

use App\Models\LoginAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LoginAuditController extends Controller
{
    /**
     * List the authenticated user's login audit log.
     */
    public function index(Request $request): JsonResponse
    {
        $entries = LoginAuditLog::where('user_id', Auth::id())
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($entries);
    }

    /**
     * Mark a login audit entry as suspicious.
     */
    public function markSuspicious(int $id): JsonResponse
    {
        $entry = LoginAuditLog::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $entry->update(['is_suspicious' => ! $entry->is_suspicious]);

        return response()->json([
            'success' => true,
            'is_suspicious' => $entry->is_suspicious,
        ]);
    }
}
