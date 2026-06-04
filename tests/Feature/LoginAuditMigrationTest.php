<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LoginAuditMigrationTest extends TestCase
{
    public function test_down_migration_restores_only_login_events_to_legacy_audit_log(): void
    {
        $this->withLoginAuditMigrationFixture(function (): void {
            $this->createUsersFixtureTable();
            $this->createAuthAuditLogFixtureTable();

            $this->insertAuthAuditEvent('password-success@example.com', 'login_succeeded', true, 'password');
            $this->insertAuthAuditEvent('password-failed@example.com', 'login_failed', false, null);
            $this->insertAuthAuditEvent('password-blocked@example.com', 'login_blocked', false, null);
            $this->insertAuthAuditEvent('passkey-success@example.com', 'passkey_login_succeeded', true, 'passkey');
            $this->insertAuthAuditEvent('passkey-failed@example.com', 'passkey_login_failed', false, null);
            $this->insertAuthAuditEvent('passkey-registered@example.com', 'passkey_registered', true, 'passkey');
            $this->insertAuthAuditEvent('password-reset@example.com', 'password_reset_requested', true, 'password');

            $migration = require database_path('migrations/2026_06_04_010000_migrate_login_audit_to_auth_audit_log.php');

            $migration->down();

            $restoredRows = DB::table('login_audit_log')
                ->orderBy('email')
                ->get(['email', 'success', 'method']);

            $this->assertCount(5, $restoredRows);
            $this->assertEqualsCanonicalizing([
                'password-success@example.com',
                'password-failed@example.com',
                'password-blocked@example.com',
                'passkey-success@example.com',
                'passkey-failed@example.com',
            ], $restoredRows->pluck('email')->all());
            $this->assertDatabaseMissing('login_audit_log', ['email' => 'passkey-registered@example.com']);
            $this->assertDatabaseMissing('login_audit_log', ['email' => 'password-reset@example.com']);
            $this->assertFalse(Schema::hasTable('auth_audit_log'));

            $methodsByEmail = $restoredRows->pluck('method', 'email')->all();
            $this->assertSame('password', $methodsByEmail['password-failed@example.com']);
            $this->assertSame('password', $methodsByEmail['password-blocked@example.com']);
            $this->assertSame('passkey', $methodsByEmail['passkey-failed@example.com']);
        });
    }

    private function withLoginAuditMigrationFixture(callable $callback): void
    {
        $originalConnection = config('database.default');

        config()->set('database.connections.login_audit_migration_fixture', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ]);
        config()->set('database.default', 'login_audit_migration_fixture');

        try {
            $callback();
        } finally {
            config()->set('database.default', $originalConnection);
            DB::purge('login_audit_migration_fixture');
        }
    }

    private function createUsersFixtureTable(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
        });
    }

    private function createAuthAuditLogFixtureTable(): void
    {
        Schema::create('auth_audit_log', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('acting_user_id')->nullable();
            $table->string('email')->nullable();
            $table->string('event', 64);
            $table->string('auth_method', 32)->nullable();
            $table->boolean('succeeded');
            $table->string('reason')->nullable();
            $table->binary('ip_address', 16)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('session_id', 64)->nullable();
            $table->boolean('is_suspicious')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    private function insertAuthAuditEvent(string $email, string $event, bool $succeeded, ?string $authMethod): void
    {
        DB::table('auth_audit_log')->insert([
            'email' => $email,
            'event' => $event,
            'auth_method' => $authMethod,
            'succeeded' => $succeeded,
            'ip_address' => null,
            'user_agent' => 'Migration rollback fixture',
            'is_suspicious' => false,
            'created_at' => '2026-06-04 01:00:00',
            'updated_at' => '2026-06-04 01:00:00',
        ]);
    }
}
