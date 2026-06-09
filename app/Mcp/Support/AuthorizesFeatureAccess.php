<?php

namespace App\Mcp\Support;

use App\Support\Access\FeatureAccess;
use Illuminate\Support\Facades\Auth;
use Laravel\Mcp\Response;

trait AuthorizesFeatureAccess
{
    protected function requireFeaturePermission(string $permission): ?Response
    {
        $user = Auth::user();

        if (! $user || ! app(FeatureAccess::class)->can($user, $permission)) {
            return Response::error("Forbidden: missing required feature permission [{$permission}].");
        }

        return null;
    }
}
