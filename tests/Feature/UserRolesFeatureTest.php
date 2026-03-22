<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserRolesFeatureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a dummy user with ID 1 first so other test users get higher IDs
        // This prevents tests from accidentally using the "always admin" user ID 1
        User::factory()->create(['id' => 1, 'user_role' => 'admin']);
    }

    /**
     * Test addRole adds a new role
     */
    public function test_add_role_adds_new_role(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $result = $user->addRole('admin');

        $this->assertTrue($result);
        $user->refresh();
        $this->assertTrue($user->hasRole('admin'));
        $this->assertTrue($user->hasRole('user'));
    }

    /**
     * Test addRole does not duplicate existing role
     */
    public function test_add_role_does_not_duplicate_existing_role(): void
    {
        $user = User::factory()->create(['user_role' => 'admin,user']);

        $result = $user->addRole('admin');

        $this->assertTrue($result);
        $user->refresh();
        $roles = $user->getRoles();
        $adminCount = count(array_filter($roles, fn ($role) => $role === 'admin'));
        $this->assertEquals(1, $adminCount);
    }

    /**
     * Test addRole converts role to lowercase
     */
    public function test_add_role_converts_to_lowercase(): void
    {
        $user = User::factory()->create(['user_role' => '']);

        $user->addRole('ADMIN');

        $user->refresh();
        $this->assertTrue($user->hasRole('admin'));
    }

    /**
     * Test addRole rejects invalid roles
     */
    public function test_add_role_rejects_roles_with_commas(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $result = $user->addRole('admin,superuser');

        $this->assertFalse($result);
        $user->refresh();
        $this->assertFalse($user->hasRole('admin,superuser'));
    }

    /**
     * Test addRole rejects empty roles
     */
    public function test_add_role_rejects_empty_roles(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);

        $result = $user->addRole('');

        $this->assertFalse($result);
    }

    /**
     * Test removeRole removes a role
     */
    public function test_remove_role_removes_role(): void
    {
        $user = User::factory()->create(['user_role' => 'admin,user']);
        $this->assertNotEquals(1, $user->id, 'Test should not use user ID 1');

        $result = $user->removeRole('admin');

        $this->assertTrue($result);
        $user->refresh();
        $this->assertFalse($user->hasRole('admin'));
        $this->assertTrue($user->hasRole('user'));
    }

    /**
     * Test removeRole handles role not present
     */
    public function test_remove_role_handles_role_not_present(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);
        $this->assertNotEquals(1, $user->id, 'Test should not use user ID 1');

        $result = $user->removeRole('admin');

        $this->assertTrue($result);
        $user->refresh();
        $this->assertEquals('user', $user->user_role);
    }

    /**
     * Test removeRole sets empty string when last role removed
     */
    public function test_remove_role_sets_empty_when_last_role_removed(): void
    {
        $user = User::factory()->create(['user_role' => 'user']);
        $this->assertNotEquals(1, $user->id, 'Test should not use user ID 1');

        $result = $user->removeRole('user');

        $this->assertTrue($result);
        $user->refresh();
        $this->assertEquals('', $user->user_role);
    }

    /**
     * Test cannot remove admin role from user ID 1
     */
    public function test_cannot_remove_admin_from_user_id_1(): void
    {
        $user = User::find(1);

        $result = $user->removeRole('admin');

        $this->assertFalse($result);
        $user->refresh();
        $this->assertTrue($user->hasRole('admin'));
    }
}
