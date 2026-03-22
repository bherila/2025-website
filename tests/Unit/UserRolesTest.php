<?php

namespace Tests\Unit;

use App\Models\User;
use PHPUnit\Framework\TestCase;

class UserRolesTest extends TestCase
{
    /**
     * Test getRoles returns an array of roles
     */
    public function test_get_roles_returns_array(): void
    {
        $user = new User;
        $user->user_role = 'admin,user';

        $roles = $user->getRoles();

        $this->assertIsArray($roles);
        $this->assertCount(2, $roles);
        $this->assertContains('admin', $roles);
        $this->assertContains('user', $roles);
    }

    /**
     * Test getRoles returns empty array when user_role is null
     */
    public function test_get_roles_returns_empty_array_when_null(): void
    {
        $user = new User;
        $user->user_role = null;

        $roles = $user->getRoles();

        $this->assertIsArray($roles);
        $this->assertCount(0, $roles);
    }

    /**
     * Test getRoles returns empty array when user_role is empty string
     */
    public function test_get_roles_returns_empty_array_when_empty_string(): void
    {
        $user = new User;
        $user->user_role = '';

        $roles = $user->getRoles();

        $this->assertIsArray($roles);
        $this->assertCount(0, $roles);
    }

    /**
     * Test hasRole returns true when user has the role
     */
    public function test_has_role_returns_true_when_user_has_role(): void
    {
        $user = new User;
        $user->user_role = 'admin,user';

        $this->assertTrue($user->hasRole('admin'));
        $this->assertTrue($user->hasRole('user'));
    }

    /**
     * Test hasRole returns false when user does not have the role
     */
    public function test_has_role_returns_false_when_user_does_not_have_role(): void
    {
        $user = new User;
        $user->user_role = 'user';

        $this->assertFalse($user->hasRole('admin'));
    }

    /**
     * Test user ID 1 always has admin role
     */
    public function test_user_id_1_always_has_admin_role(): void
    {
        $user = new User;
        $user->id = 1;
        $user->user_role = 'user';

        $this->assertTrue($user->hasRole('admin'));
    }

    /**
     * Test canLogin returns true when user has 'user' role
     */
    public function test_can_login_returns_true_with_user_role(): void
    {
        $user = new User;
        $user->user_role = 'user';

        $this->assertTrue($user->canLogin());
    }

    /**
     * Test canLogin returns true when user has 'admin' role
     */
    public function test_can_login_returns_true_with_admin_role(): void
    {
        $user = new User;
        $user->user_role = 'admin';

        $this->assertTrue($user->canLogin());
    }

    /**
     * Test canLogin returns false when user has no login role
     */
    public function test_can_login_returns_false_without_login_role(): void
    {
        $user = new User;
        $user->user_role = 'disabled';

        $this->assertFalse($user->canLogin());
    }

    /**
     * Test canLogin returns false when user has empty role
     */
    public function test_can_login_returns_false_with_empty_role(): void
    {
        $user = new User;
        $user->user_role = '';

        $this->assertFalse($user->canLogin());
    }

    /**
     * Test user_role accessor returns 'Admin' for admin users
     */
    public function test_user_role_accessor_returns_admin_for_admins(): void
    {
        $user = new User;
        $user->user_role = 'admin'; // Underlying value

        // The accessor getUserRoleAttribute should return 'Admin'
        $this->assertEquals('Admin', $user->user_role);
    }

    /**
     * Test user_role accessor returns 'Admin' for user ID 1
     */
    public function test_user_role_accessor_returns_admin_for_user_id_1(): void
    {
        $user = new User;
        $user->id = 1;
        $user->user_role = 'user'; // Underlying value

        $this->assertEquals('Admin', $user->user_role);
    }

    /**
     * Test virtual_user_role alias
     */
    public function test_virtual_user_role_alias(): void
    {
        $user = new User;
        $user->user_role = 'admin';

        $this->assertEquals('Admin', $user->virtual_user_role);
    }

    /**
     * Test user_role accessor returns original role for non-admins
     */
    public function test_user_role_accessor_returns_original_role_for_non_admins(): void
    {
        $user = new User;
        $user->user_role = 'User';

        $this->assertEquals('User', $user->user_role);
    }
}
