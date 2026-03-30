<?php

namespace Tests\Feature;

use Tests\TestCase;

class QueueMonitorAccessTest extends TestCase
{
    public function test_queue_monitor_requires_authentication(): void
    {
        $response = $this->get('/queue-monitor');
        $response->assertRedirect('/login');
    }

    public function test_queue_monitor_requires_admin_role(): void
    {
        // Create admin first so regular user doesn't get ID 1 (which always has admin)
        $this->createAdminUser();
        $user = $this->createUser();

        $response = $this->actingAs($user)->get('/queue-monitor');
        $response->assertForbidden();
    }

    public function test_queue_monitor_accessible_to_admin(): void
    {
        $admin = $this->createAdminUser();

        $response = $this->actingAs($admin)->get('/queue-monitor');
        $response->assertSuccessful();
    }
}
