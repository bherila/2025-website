<?php

namespace Tests;

use App\Models\User;
use App\Models\UserFeaturePermission;
use App\Support\Access\FeatureRegistry;

/**
 * Base test case for all tests.
 *
 * Extends SafeTestCase which verifies at runtime that every test uses
 * an in-memory SQLite connection, preventing accidental use of MySQL.
 */
abstract class TestCase extends SafeTestCase
{
    use CreatesApplication;

    /**
     * Grant a non-admin user every feature permission in the registry.
     *
     * Useful for ownership/scope tests where a second, non-admin user must
     * pass the feature-permission gate so the controller's own scope check
     * (not the gate) is what's being exercised. User ID 1 is always admin.
     */
    protected function grantAllFeatures(User $user): User
    {
        foreach (app(FeatureRegistry::class)->keys() as $permission) {
            UserFeaturePermission::query()->firstOrCreate([
                'user_id' => $user->id,
                'permission' => $permission,
            ]);
        }

        return $user;
    }

    /**
     * Grant a non-admin user a specific set of feature permissions.
     *
     * Dependencies are resolved at authorization time by FeatureAccess, so only
     * the directly granted keys need to be stored here.
     *
     * @param  list<string>  $permissions
     */
    protected function grantFeatures(User $user, array $permissions): User
    {
        foreach ($permissions as $permission) {
            UserFeaturePermission::query()->firstOrCreate([
                'user_id' => $user->id,
                'permission' => $permission,
            ]);
        }

        return $user->refresh();
    }

    /**
     * Create a user with admin role for testing.
     *
     * @param  array  $attributes  Additional attributes for the user
     */
    protected function createAdminUser(array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'user_role' => 'admin',
        ], $attributes));
    }

    /**
     * Create a regular user for testing.
     *
     * @param  array  $attributes  Additional attributes for the user
     */
    protected function createUser(array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'user_role' => 'user',
        ], $attributes));
    }
}
