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

        return $this->registry->resolveEffective($this->directPermissions($user));
    }
}
