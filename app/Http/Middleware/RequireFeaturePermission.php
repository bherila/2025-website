<?php

namespace App\Http\Middleware;

use App\Support\Access\FeatureAccess;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireFeaturePermission
{
    public function __construct(private readonly FeatureAccess $featureAccess) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $permission): Response|JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        if (! $this->featureAccess->can($user, $permission)) {
            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'Forbidden',
                    'required_permission' => $permission,
                ], 403);
            }

            abort(403);
        }

        return $next($request);
    }
}
