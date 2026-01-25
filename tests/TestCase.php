<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

/**
 * Base test case for all tests.
 *
 * This class ensures tests run safely with SQLite and never touch
 * production/development MySQL databases.
 */
abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    /**
     * Setup the test environment.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Safety check: Ensure we're using SQLite, not MySQL
        // This prevents accidentally running tests against production data
        $this->assertDatabaseIsSqlite();
    }

    /**
     * Assert that the database connection is SQLite.
     *
     * This is a critical safety check to prevent tests from accidentally
     * running against MySQL databases (which might contain production data).
     */
    protected function assertDatabaseIsSqlite(): void
    {
        $connection = config('database.default');
        $driver = config("database.connections.{$connection}.driver");

        if ($driver !== 'sqlite') {
            $this->fail(
                "SAFETY ERROR: Tests must use SQLite database, not '{$driver}'. ".
                'Check that phpunit.xml sets DB_CONNECTION=sqlite and DB_DATABASE=:memory:. '.
                'This prevents tests from accidentally modifying MySQL databases.'
            );
        }
    }

    /**
     * Create a user with admin role for testing.
     *
     * @param  array  $attributes  Additional attributes for the user
     */
    protected function createAdminUser(array $attributes = []): \App\Models\User
    {
        return \App\Models\User::factory()->create(array_merge([
            'user_role' => 'admin',
        ], $attributes));
    }

    /**
     * Create a regular user for testing.
     *
     * @param  array  $attributes  Additional attributes for the user
     */
    protected function createUser(array $attributes = []): \App\Models\User
    {
        return \App\Models\User::factory()->create(array_merge([
            'user_role' => 'user',
        ], $attributes));
    }
}
