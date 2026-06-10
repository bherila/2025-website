<?php

namespace App\Http\Middleware;

use App\Support\Access\FeatureAccess;
use App\Support\Agent\AgentContext;
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
     * On agent API requests the bound AgentContext carries the bearer token's
     * scope; a permission only satisfies the check when the token scope also
     * allows it (token scopes only ever shrink access). Web/session requests
     * resolve the default anonymous context, whose null token allows all.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response|JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            abort(401);
        }

        $agentContext = app(AgentContext::class);

        foreach ($permissions as $permission) {
            if ($this->featureAccess->can($user, $permission) && $agentContext->tokenAllows($permission)) {
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
