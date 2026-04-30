<?php

namespace App\Http\Controllers;

use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserManagementApiController extends Controller
{
    /**
     * Available roles in the system.
     */
    public const AVAILABLE_ROLES = ['admin', 'user'];

    /**
     * List all users with their roles and client companies.
     */
    public function index(Request $request): JsonResponse
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
                    'can_login_as_client' => ! $user->hasRole('admin') && $user->canLogin() && $user->clientCompanies->isNotEmpty(),
                    'client_companies' => $user->clientCompanies->map(fn ($c) => [
                        'id' => $c->id,
                        'name' => $c->company_name,
                        'slug' => $c->slug,
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
    public function addRole(Request $request, int $id): JsonResponse
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
    public function removeRole(Request $request, int $id, string $role): JsonResponse
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
    public function setPassword(Request $request, int $id): JsonResponse
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

    /**
     * Create a new user.
     */
    public function create(Request $request): JsonResponse
    {
        Gate::authorize('admin');

        $request->validate([
            'email' => 'required|email|unique:users,email',
            'name' => 'nullable|string|max:255',
            'password' => 'nullable|string|min:8',
        ]);

        $userData = [
            'email' => $request->email,
            'name' => $request->name ?: explode('@', $request->email)[0],
        ];

        if ($request->password) {
            $userData['password'] = Hash::make($request->password);
        } else {
            // Generate a random password if none provided
            $userData['password'] = Hash::make(Str::random(32));
        }

        $user = User::create($userData);

        return response()->json([
            'success' => true,
            'message' => 'User created successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ], 201);
    }

    /**
     * Update a user's email address.
     */
    public function updateEmail(Request $request, int $id): JsonResponse
    {
        Gate::authorize('admin');

        $request->validate([
            'email' => 'required|email|unique:users,email,'.$id,
        ]);

        $user = User::findOrFail($id);
        $user->update([
            'email' => $request->email,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email updated successfully',
            'email' => $user->email,
        ]);
    }

    /**
     * Start an admin-initiated client preview session.
     */
    public function loginAs(Request $request, int $id): JsonResponse
    {
        Gate::authorize('admin');

        $validated = $request->validate([
            'client_company_id' => 'required|integer|exists:client_companies,id',
        ]);

        $admin = $request->user();
        $user = User::with('clientCompanies')->findOrFail($id);

        if ($admin->id === $user->id) {
            return response()->json([
                'message' => 'You cannot login as yourself.',
            ], 422);
        }

        if ($user->hasRole('admin')) {
            return response()->json([
                'message' => 'Admin users cannot be used for client portal preview.',
            ], 422);
        }

        if (! $user->canLogin()) {
            return response()->json([
                'message' => 'This user cannot log in.',
            ], 422);
        }

        $company = $user->clientCompanies
            ->firstWhere('id', (int) $validated['client_company_id']);

        if (! $company instanceof ClientCompany) {
            return response()->json([
                'message' => 'This user is not assigned to that client company.',
            ], 422);
        }

        Auth::login($user);
        $request->session()->regenerate();
        $request->session()->put('impersonator_user_id', $admin->id);

        return response()->json([
            'success' => true,
            'redirect_url' => route('client-portal.index', ['slug' => $company->slug]),
        ]);
    }
}
