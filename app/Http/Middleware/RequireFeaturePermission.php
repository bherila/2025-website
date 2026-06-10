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
     * Authorize the request when the user holds ANY of the given feature
     * permissions. Passing multiple permissions (comma-separated in the route
     * definition, e.g. `feature:finance.lots.view,finance.transactions.view`)
     * grants access if at least one is satisfied, without over-granting either.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response|JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        foreach ($permissions as $permission) {
            if ($this->featureAccess->can($user, $permission)) {
                return $next($request);
            }
        }

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Forbidden',
                'required_permission' => implode(',', $permissions),
            ], 403);
        }

        abort(403);
    }
}
