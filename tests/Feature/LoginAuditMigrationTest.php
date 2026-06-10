<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LoginAuditMigrationTest extends TestCase
{
    public function test_up_backfills_legacy_rows_then_skips_when_already_migrated(): void
    {
        Schema::dropIfExists('login_audit_log');
        DB::table('auth_audit_log')->delete();

        DB::table('auth_audit_log')->insert($this->auditRow('registered@example.com', 'passkey_registered', true, 'passkey'));

        $legacyRows = $this->legacyRows();

        $this->createLegacyTable();
        DB::table('login_audit_log')->insert($legacyRows);

        $migration = $this->migration();
        $migration->up();

        $this->assertSame(4, DB::table('auth_audit_log')->count());
        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'registered@example.com',
            'event' => 'passkey_registered',
        ]);
        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'success@example.com',
            'event' => 'login_succeeded',
            'auth_method' => 'password',
            'succeeded' => true,
        ]);
        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'passkey@example.com',
            'event' => 'passkey_login_succeeded',
            'auth_method' => 'passkey',
        ]);
        $this->assertDatabaseHas('auth_audit_log', [
            'email' => 'failure@example.com',
            'event' => 'login_failed',
            'succeeded' => false,
        ]);

        // Re-running when the legacy table could not be dropped (e.g. the MySQL
        // user lacks the DROP privilege on production) must not duplicate rows.
        $this->createLegacyTable();
        DB::table('login_audit_log')->insert($legacyRows);
        $migration->up();

        $this->assertSame(4, DB::table('auth_audit_log')->count());
    }

    public function test_down_restores_only_login_events_to_legacy_table(): void
    {
        Schema::dropIfExists('login_audit_log');
        DB::table('auth_audit_log')->delete();

        DB::table('auth_audit_log')->insert([
            $this->auditRow('password-success@example.com', 'login_succeeded', true, 'password'),
            $this->auditRow('password-failed@example.com', 'login_failed', false, null),
            $this->auditRow('password-blocked@example.com', 'login_blocked', false, null),
            $this->auditRow('passkey-success@example.com', 'passkey_login_succeeded', true, 'passkey'),
            $this->auditRow('passkey-failed@example.com', 'passkey_login_failed', false, null),
            $this->auditRow('passkey-registered@example.com', 'passkey_registered', true, 'passkey'),
            $this->auditRow('password-reset@example.com', 'password_reset_requested', true, 'password'),
        ]);

        $this->migration()->down();

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
    }

    public function test_down_does_not_duplicate_when_legacy_table_survived_cutover(): void
    {
        Schema::dropIfExists('login_audit_log');
        DB::table('auth_audit_log')->delete();

        $legacyRows = $this->legacyRows();

        $this->createLegacyTable();
        DB::table('login_audit_log')->insert($legacyRows);
        DB::table('auth_audit_log')->insert(array_map(
            fn (array $legacyRow): array => $this->auditRowFromLegacyRow($legacyRow),
            $legacyRows,
        ));

        $this->migration()->down();

        $this->assertTrue(Schema::hasTable('login_audit_log'));
        $this->assertSame(3, DB::table('login_audit_log')->count());
        $this->assertFalse(Schema::hasTable('auth_audit_log'));
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_06_04_010000_migrate_login_audit_to_auth_audit_log.php');
    }

    private function createLegacyTable(): void
    {
        Schema::create('login_audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable();
            $table->string('email')->nullable();
            $table->binary('ip_address', 16)->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('success')->default(false);
            $table->string('method')->default('password');
            $table->boolean('is_suspicious')->default(false);
            $table->timestamps();
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function legacyRows(): array
    {
        return [
            ['email' => 'success@example.com', 'success' => true, 'method' => 'password', 'is_suspicious' => false, 'created_at' => now(), 'updated_at' => now()],
            ['email' => 'passkey@example.com', 'success' => true, 'method' => 'passkey', 'is_suspicious' => false, 'created_at' => now(), 'updated_at' => now()],
            ['email' => 'failure@example.com', 'success' => false, 'method' => 'password', 'is_suspicious' => false, 'created_at' => now(), 'updated_at' => now()],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function auditRow(string $email, string $event, bool $succeeded, ?string $authMethod): array
    {
        return [
            'email' => $email,
            'event' => $event,
            'auth_method' => $authMethod,
            'succeeded' => $succeeded,
            'is_suspicious' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<string, mixed>  $legacyRow
     * @return array<string, mixed>
     */
    private function auditRowFromLegacyRow(array $legacyRow): array
    {
        $succeeded = (bool) $legacyRow['success'];
        $method = (string) $legacyRow['method'];

        return [
            'user_id' => $legacyRow['user_id'] ?? null,
            'email' => $legacyRow['email'],
            'event' => match (true) {
                $succeeded && $method === 'passkey' => 'passkey_login_succeeded',
                ! $succeeded && $method === 'passkey' => 'passkey_login_failed',
                $succeeded => 'login_succeeded',
                default => 'login_failed',
            },
            'auth_method' => $method,
            'succeeded' => $succeeded,
            'ip_address' => $legacyRow['ip_address'] ?? null,
            'user_agent' => $legacyRow['user_agent'] ?? null,
            'is_suspicious' => $legacyRow['is_suspicious'],
            'created_at' => $legacyRow['created_at'],
            'updated_at' => $legacyRow['updated_at'],
        ];
    }
}
