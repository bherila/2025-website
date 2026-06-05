<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const LEGACY_LOGIN_EVENTS = [
        'login_succeeded',
        'login_failed',
        'login_blocked',
        'passkey_login_succeeded',
        'passkey_login_failed',
    ];

    public function up(): void
    {
        $auditTable = config('bherila-auth.audit.table', 'auth_audit_log');

        $this->createAuthAuditLogTable($auditTable);
        $this->backfillFromLegacyLoginAuditLog($auditTable);

        $this->dropLegacyLoginAuditLog();
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
            $this->legacyRowsMissingFromAuthAuditLog($auditTable)->select([
                'legacy.user_id',
                DB::raw('NULL as acting_user_id'),
                'legacy.email',
                DB::raw($this->legacyEventExpression('legacy').' as event'),
                'legacy.method as auth_method',
                'legacy.success as succeeded',
                DB::raw('NULL as reason'),
                'legacy.ip_address',
                'legacy.user_agent',
                DB::raw('NULL as session_id'),
                'legacy.is_suspicious',
                DB::raw('NULL as metadata'),
                'legacy.created_at',
                'legacy.updated_at',
            ])
        );
    }

    private function dropLegacyLoginAuditLog(): void
    {
        if (! Schema::hasTable('login_audit_log')) {
            return;
        }

        try {
            Schema::drop('login_audit_log');
        } catch (QueryException) {
            // Some hosted MySQL accounts withhold the DROP privilege from the
            // application user. The table is no longer read or written after the
            // cutover, so leaving it orphaned is safe; a privileged operator can
            // drop it manually later.
        }
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
            $table->binary('ip_address', 16)->nullable();
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

    private function legacyRowsMissingFromAuthAuditLog(string $auditTable): Builder
    {
        return DB::table('login_audit_log as legacy')
            ->whereNotExists(function (Builder $query) use ($auditTable): void {
                $query->selectRaw('1')
                    ->from($auditTable.' as existing')
                    ->whereRaw($this->nullableColumnsEqual('existing.user_id', 'legacy.user_id'))
                    ->whereRaw($this->nullableColumnsEqual('existing.email', 'legacy.email'))
                    ->whereRaw('existing.event = '.$this->legacyEventExpression('legacy'))
                    ->whereRaw($this->nullableColumnsEqual('existing.auth_method', 'legacy.method'))
                    ->whereColumn('existing.succeeded', 'legacy.success')
                    ->whereRaw($this->nullableColumnsEqual('existing.ip_address', 'legacy.ip_address'))
                    ->whereRaw($this->nullableColumnsEqual('existing.user_agent', 'legacy.user_agent'))
                    ->whereColumn('existing.is_suspicious', 'legacy.is_suspicious')
                    ->whereColumn('existing.created_at', 'legacy.created_at')
                    ->whereColumn('existing.updated_at', 'legacy.updated_at');
            });
    }

    private function legacyBackfillQuery(string $auditTable): Builder
    {
        return DB::table($auditTable.' as audit')
            ->whereIn('audit.event', self::LEGACY_LOGIN_EVENTS)
            ->whereNotExists(function (Builder $query): void {
                $query->selectRaw('1')
                    ->from('login_audit_log as existing')
                    ->whereRaw($this->nullableColumnsEqual('existing.user_id', 'audit.user_id'))
                    ->whereRaw($this->nullableColumnsEqual('existing.email', 'audit.email'))
                    ->whereRaw($this->nullableColumnsEqual('existing.ip_address', 'audit.ip_address'))
                    ->whereRaw($this->nullableColumnsEqual('existing.user_agent', 'audit.user_agent'))
                    ->whereColumn('existing.success', 'audit.succeeded')
                    ->whereRaw('existing.method = '.$this->legacyMethodExpression('audit'))
                    ->whereColumn('existing.is_suspicious', 'audit.is_suspicious')
                    ->whereColumn('existing.created_at', 'audit.created_at')
                    ->whereColumn('existing.updated_at', 'audit.updated_at');
            })
            ->select([
                'audit.user_id',
                'audit.email',
                'audit.ip_address',
                'audit.user_agent',
                'audit.succeeded as success',
                DB::raw($this->legacyMethodExpression('audit').' as method'),
                'audit.is_suspicious',
                'audit.created_at',
                'audit.updated_at',
            ]);
    }

    private function legacyEventExpression(string $tableAlias): string
    {
        $successColumn = $tableAlias.'.success';
        $methodColumn = $tableAlias.'.method';

        return <<<SQL
            CASE
                WHEN {$successColumn} = 1 AND {$methodColumn} = 'passkey' THEN 'passkey_login_succeeded'
                WHEN {$successColumn} = 0 AND {$methodColumn} = 'passkey' THEN 'passkey_login_failed'
                WHEN {$successColumn} = 1 THEN 'login_succeeded'
                ELSE 'login_failed'
            END
        SQL;
    }

    private function legacyMethodExpression(string $tableAlias): string
    {
        $authMethodColumn = $tableAlias.'.auth_method';
        $eventColumn = $tableAlias.'.event';

        return <<<SQL
            CASE
                WHEN {$authMethodColumn} IS NOT NULL THEN {$authMethodColumn}
                WHEN {$eventColumn} LIKE 'passkey_%' THEN 'passkey'
                ELSE 'password'
            END
        SQL;
    }

    private function nullableColumnsEqual(string $leftColumn, string $rightColumn): string
    {
        return "({$leftColumn} = {$rightColumn} OR ({$leftColumn} IS NULL AND {$rightColumn} IS NULL))";
    }
};
