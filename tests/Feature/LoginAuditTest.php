<?php

namespace Tests\Feature;

use App\Models\User;
use BWH\Auth\Contracts\AuthAuditLogger;
use BWH\Auth\Models\AuthAuditLog;
use BWH\Auth\Services\DatabaseAuthAuditLogger;
use Tests\TestCase;

class LoginAuditTest extends TestCase
{
    public function test_package_database_audit_logger_is_bound(): void
    {
        $this->assertInstanceOf(DatabaseAuthAuditLogger::class, app(AuthAuditLogger::class));
    }

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

        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'audit@example.com',
            'event' => AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
            'succeeded' => true,
            'auth_method' => 'password',
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

        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'audit@example.com',
            'event' => AuthAuditLog::EVENT_LOGIN_FAILED,
            'succeeded' => false,
            'auth_method' => 'password',
            'reason' => 'Invalid credentials',
        ]);
    }

    public function test_authenticated_user_can_view_audit_log(): void
    {
        $user = $this->createUser();

        AuthAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'event' => AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
            'auth_method' => 'password',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        $response = $this->actingAs($user)->get('/api/login-audit');
        $response->assertStatus(200);
        $response->assertJsonStructure(['data', 'current_page', 'total']);
        $response->assertJsonPath('data.0.success', true);
        $response->assertJsonPath('data.0.method', 'password');
    }

    public function test_audit_log_endpoint_excludes_non_login_auth_events(): void
    {
        $user = $this->createUser();

        AuthAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'event' => AuthAuditLog::EVENT_PASSKEY_REGISTERED,
            'auth_method' => 'passkey',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        AuthAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'event' => AuthAuditLog::EVENT_PASSKEY_LOGIN_SUCCEEDED,
            'auth_method' => 'passkey',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        $response = $this->actingAs($user)->get('/api/login-audit');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.method', 'passkey');
    }

    public function test_user_cannot_view_other_users_audit_log(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        AuthAuditLog::create([
            'user_id' => $user2->id,
            'email' => $user2->email,
            'event' => AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
            'auth_method' => 'password',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        $response = $this->actingAs($user1)->get('/api/login-audit');
        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertCount(0, $data);
    }

    public function test_user_can_mark_entry_as_suspicious(): void
    {
        $user = $this->createUser();

        $entry = AuthAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'event' => AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
            'auth_method' => 'password',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
            'is_suspicious' => false,
        ]);

        $response = $this->actingAs($user)->post("/api/login-audit/{$entry->id}/suspicious");
        $response->assertStatus(200);
        $response->assertJson(['success' => true, 'is_suspicious' => true]);

        $this->assertDatabaseHas('auth_audit_log', [
            'id' => $entry->id,
            'is_suspicious' => true,
        ]);
    }

    public function test_user_cannot_mark_other_users_entry_as_suspicious(): void
    {
        $user1 = $this->createUser(['email' => 'user1@example.com']);
        $user2 = $this->createUser(['email' => 'user2@example.com']);

        $entry = AuthAuditLog::create([
            'user_id' => $user2->id,
            'email' => $user2->email,
            'event' => AuthAuditLog::EVENT_LOGIN_SUCCEEDED,
            'auth_method' => 'password',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        $response = $this->actingAs($user1)->postJson("/api/login-audit/{$entry->id}/suspicious");
        $response->assertStatus(404);
    }

    public function test_user_cannot_mark_non_login_auth_event_as_suspicious_through_login_audit_route(): void
    {
        $user = $this->createUser();

        $entry = AuthAuditLog::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'event' => AuthAuditLog::EVENT_PASSKEY_REGISTERED,
            'auth_method' => 'passkey',
            'succeeded' => true,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Test',
        ]);

        $response = $this->actingAs($user)->postJson("/api/login-audit/{$entry->id}/suspicious");

        $response->assertStatus(404);
    }

    public function test_unauthenticated_user_cannot_access_audit_log(): void
    {
        $response = $this->get('/api/login-audit');
        $response->assertStatus(302); // Redirect to login
    }
}
