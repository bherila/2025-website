<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;

class UserManagementApiController extends Controller
{
    /**
     * Available roles in the system.
     */
    public const AVAILABLE_ROLES = ['admin', 'user'];

    /**
     * List all users with their roles and client companies.
     */
    public function index(Request $request)
    {
        Gate::authorize('admin');

        $users = User::with('clientCompanies')
            ->orderBy('name')
            ->get()
            ->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'roles' => $user->getRoles(),
                    'client_companies' => $user->clientCompanies->map(fn ($c) => [
                        'id' => $c->id,
                        'name' => $c->name,
                    ]),
                    'last_login_date' => $user->last_login_date,
                    'created_at' => $user->created_at,
                ];
            });

        return response()->json([
            'users' => $users,
            'available_roles' => self::AVAILABLE_ROLES,
        ]);
    }

    /**
     * Add a role to a user.
     */
    public function addRole(Request $request, int $id)
    {
        Gate::authorize('admin');

        $request->validate([
            'role' => 'required|string|in:'.implode(',', self::AVAILABLE_ROLES),
        ]);

        $user = User::findOrFail($id);
        $role = strtolower(trim($request->role));

        if ($user->addRole($role)) {
            return response()->json([
                'success' => true,
                'message' => "Role '{$role}' added to user",
                'roles' => $user->getRoles(),
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Failed to add role',
        ], 400);
    }

    /**
     * Remove a role from a user.
     */
    public function removeRole(Request $request, int $id, string $role)
    {
        Gate::authorize('admin');

        $user = User::findOrFail($id);
        $role = strtolower(trim($role));

        if (! in_array($role, self::AVAILABLE_ROLES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid role',
            ], 400);
        }

        // Prevent removing admin from user ID 1
        if ($role === 'admin' && $user->id === 1) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove admin role from the primary administrator',
            ], 403);
        }

        if ($user->removeRole($role)) {
            return response()->json([
                'success' => true,
                'message' => "Role '{$role}' removed from user",
                'roles' => $user->getRoles(),
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Failed to remove role',
        ], 400);
    }

    /**
     * Set a user's password.
     */
    public function setPassword(Request $request, int $id)
    {
        Gate::authorize('admin');

        $request->validate([
            'password' => 'required|string|min:8',
        ]);

        $user = User::findOrFail($id);
        $user->update([
            'password' => Hash::make($request->password),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Password updated successfully',
        ]);
    }
}
