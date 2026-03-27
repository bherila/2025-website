<?php

namespace Tests\Feature;

use App\Models\LoginAuditLog;
use App\Models\User;
use Tests\TestCase;

class LoginAuditTest extends TestCase
{
    public function test_login_success_is_logged(): void
    {
        $user = User::factory()->create([
            'email' => 'audit@example.com',
            'password' => bcrypt('password123'),
            'user_role' => 'user',
        ]);

        $this->post('/login', [
            'email' => 'audit@example.com',
            'password' => 'password123',
        ]);

        $this->assertDatabaseHas('login_audit_log', [
            'email' => 'audit@example.com',
            'success' => true,
            'method' => 'password',
        ]);
    }

    public function test_login_failure_is_logged(): void
    {
        User::factory()->create([
            'email' => 'audit@example.com',
            'password' => bcrypt('password123'),
            'user_role' => 'user',
        ]);

        $this->post('/login', [
            'email' => 'audit@example.com',
            'password' => 'wrongpassword',
        ]);

        $this->assertDatabaseHas('login_audit_log', [
            'email' => 'audit@example.com',
            'success' => false,
            'method' => 'password',
        ]);
    }

    public function test_authenticated_user_can_view_audit_log(): void
    {
        $user = $this->createUser();

        LoginAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'success' => true,
            'method' => 'password',
        ]);

        $response = $this->actingAs($user)->get('/api/login-audit');
        $response->assertStatus(200);
        $response->assertJsonStructure(['data', 'current_page', 'total']);
    }

    public function test_user_cannot_view_other_users_audit_log(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        LoginAuditLog::create([
            'user_id' => $user2->id,
            'email' => $user2->email,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'success' => true,
            'method' => 'password',
        ]);

        $response = $this->actingAs($user1)->get('/api/login-audit');
        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(0, $data);
    }

    public function test_user_can_mark_entry_as_suspicious(): void
    {
        $user = $this->createUser();

        $entry = LoginAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'success' => true,
            'method' => 'password',
            'is_suspicious' => false,
        ]);

        $response = $this->actingAs($user)->post("/api/login-audit/{$entry->id}/suspicious");
        $response->assertStatus(200);
        $response->assertJson(['success' => true, 'is_suspicious' => true]);

        $this->assertDatabaseHas('login_audit_log', [
            'id' => $entry->id,
            'is_suspicious' => true,
        ]);
    }

    public function test_user_cannot_mark_other_users_entry_as_suspicious(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        $entry = LoginAuditLog::create([
            'user_id' => $user2->id,
            'email' => $user2->email,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'success' => true,
            'method' => 'password',
        ]);

        $response = $this->actingAs($user1)->post("/api/login-audit/{$entry->id}/suspicious");
        $response->assertStatus(404);
    }

    public function test_unauthenticated_user_cannot_access_audit_log(): void
    {
        $response = $this->get('/api/login-audit');
        $response->assertStatus(302); // Redirect to login
    }
}
