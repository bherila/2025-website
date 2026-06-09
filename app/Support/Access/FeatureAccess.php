<?php

namespace App\Support\Access;

use App\Models\User;

class FeatureAccess
{
    public function __construct(private readonly FeatureRegistry $registry) {}

    public function can(User $user, string $permission): bool
    {
        if ($user->hasRole('admin')) {
            return true;
        }

        if (! $this->registry->exists($permission)) {
            return false;
        }

        return in_array($permission, $this->effectivePermissions($user), true);
    }

    /** @return list<string> */
    public function directPermissions(User $user): array
    {
        return $user->featurePermissions()
            ->orderBy('permission')
            ->pluck('permission')
            ->all();
    }

    /** @return list<string> */
    public function effectivePermissions(User $user): array
    {
        if ($user->hasRole('admin')) {
            return $this->registry->keys();
        }

        // Ignore stored grants whose key is no longer in the registry (e.g. a
        // permission was renamed/removed). resolveEffective() throws on unknown
        // keys, which would otherwise 500 every authorization check for the user.
        $known = array_values(array_filter(
            $this->directPermissions($user),
            fn (string $permission): bool => $this->registry->exists($permission)
        ));

        return $this->registry->resolveEffective($known);
    }
}
