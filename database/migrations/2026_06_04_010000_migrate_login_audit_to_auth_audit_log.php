<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $auditTable = config('bherila-auth.audit.table', 'auth_audit_log');

        $this->createAuthAuditLogTable($auditTable);
        $this->backfillFromLegacyLoginAuditLog($auditTable);

        Schema::dropIfExists('login_audit_log');
    }

    public function down(): void
    {
        $auditTable = config('bherila-auth.audit.table', 'auth_audit_log');

        $this->createLegacyLoginAuditLogTable();
        $this->backfillToLegacyLoginAuditLog($auditTable);

        Schema::dropIfExists($auditTable);
    }

    private function createAuthAuditLogTable(string $auditTable): void
    {
        if (Schema::hasTable($auditTable)) {
            return;
        }

        Schema::create($auditTable, function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained(table: 'users', indexName: 'auth_audit_log_user_id_fk')->nullOnDelete();
            $table->foreignId('acting_user_id')->nullable()->constrained(table: 'users', indexName: 'auth_audit_log_acting_user_id_fk')->nullOnDelete();
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

            $table->index(['user_id', 'created_at'], 'auth_audit_log_user_created_idx');
            $table->index('event', 'auth_audit_log_event_idx');
            $table->index('email', 'auth_audit_log_email_idx');
            $table->index('created_at', 'auth_audit_log_created_at_idx');
        });
    }

    private function backfillFromLegacyLoginAuditLog(string $auditTable): void
    {
        if (! Schema::hasTable('login_audit_log')) {
            return;
        }

        DB::table($auditTable)->insertUsing(
            [
                'user_id',
                'acting_user_id',
                'email',
                'event',
                'auth_method',
                'succeeded',
                'reason',
                'ip_address',
                'user_agent',
                'session_id',
                'is_suspicious',
                'metadata',
                'created_at',
                'updated_at',
            ],
            DB::table('login_audit_log')->select([
                'user_id',
                DB::raw('NULL as acting_user_id'),
                'email',
                DB::raw($this->legacyEventExpression().' as event'),
                'method as auth_method',
                'success as succeeded',
                DB::raw('NULL as reason'),
                'ip_address',
                'user_agent',
                DB::raw('NULL as session_id'),
                'is_suspicious',
                DB::raw('NULL as metadata'),
                'created_at',
                'updated_at',
            ])
        );
    }

    private function createLegacyLoginAuditLogTable(): void
    {
        if (Schema::hasTable('login_audit_log')) {
            return;
        }

        Schema::create('login_audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained(table: 'users', indexName: 'login_audit_log_user_id_fk')->nullOnDelete();
            $table->string('email')->nullable();
            $table->binary('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->boolean('success')->default(false);
            $table->string('method')->default('password');
            $table->boolean('is_suspicious')->default(false);
            $table->timestamps();
            $table->index('user_id', 'login_audit_log_user_id_idx');
            $table->index('created_at', 'login_audit_log_created_at_idx');
        });
    }

    private function backfillToLegacyLoginAuditLog(string $auditTable): void
    {
        if (! Schema::hasTable($auditTable)) {
            return;
        }

        DB::table('login_audit_log')->insertUsing(
            [
                'user_id',
                'email',
                'ip_address',
                'user_agent',
                'success',
                'method',
                'is_suspicious',
                'created_at',
                'updated_at',
            ],
            $this->legacyBackfillQuery($auditTable)
        );
    }

    private function legacyBackfillQuery(string $auditTable): Builder
    {
        return DB::table($auditTable)->select([
            'user_id',
            'email',
            'ip_address',
            'user_agent',
            'succeeded as success',
            DB::raw($this->legacyMethodExpression().' as method'),
            'is_suspicious',
            'created_at',
            'updated_at',
        ]);
    }

    private function legacyEventExpression(): string
    {
        return <<<'SQL'
            CASE
                WHEN success = 1 AND method = 'passkey' THEN 'passkey_login_succeeded'
                WHEN success = 0 AND method = 'passkey' THEN 'passkey_login_failed'
                WHEN success = 1 THEN 'login_succeeded'
                ELSE 'login_failed'
            END
        SQL;
    }

    private function legacyMethodExpression(): string
    {
        return <<<'SQL'
            CASE
                WHEN auth_method IS NOT NULL THEN auth_method
                WHEN event LIKE 'passkey_%' THEN 'passkey'
                ELSE 'password'
            END
        SQL;
    }
};
