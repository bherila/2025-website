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
}
