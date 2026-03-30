<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Converts login_audit_log.ip_address from VARCHAR(45) to binary storage:
     * - SQLite (test DB): drop and recreate column as BLOB (no data migration needed)
     * - MySQL: convert existing string IPs via INET6_ATON / INET_ATON, then ALTER to VARBINARY(16)
     *
     * After this migration, application code uses PHP inet_pton()/inet_ntop() (via IpAddressCast)
     * to convert between human-readable strings and binary, ensuring compatibility with both drivers.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            // SQLite: drop and recreate column as BLOB.
            // Test data is ephemeral so no data migration is necessary.
            Schema::table('login_audit_log', function (Blueprint $table) {
                $table->dropColumn('ip_address');
            });
            Schema::table('login_audit_log', function (Blueprint $table) {
                // Note: after() is ignored on SQLite; the column is appended to the end.
                $table->binary('ip_address')->nullable()->after('email');
            });
        } else {
            // MySQL / MariaDB: convert existing string IP addresses to binary in place,
            // then change the column type to VARBINARY(16).
            //
            // IS_IPV6() requires MySQL >= 5.6.3. INET6_ATON() handles both IPv4 and IPv6.
            // We use IF(IS_IPV6(...)) so IPv4-mapped addresses stay as 4-byte packed values
            // when IS_IPV6 returns false, keeping backward compatibility with INET_ATON().
            DB::statement(<<<'SQL'
                UPDATE login_audit_log
                SET ip_address = IF(
                    IS_IPV6(ip_address),
                    INET6_ATON(ip_address),
                    INET_ATON(ip_address)
                )
                WHERE ip_address IS NOT NULL
            SQL);

            // VARBINARY(16): variable length, up to 16 bytes.
            // IPv4 uses 4 bytes; IPv6 uses 16 bytes.
            DB::statement('ALTER TABLE login_audit_log MODIFY ip_address VARBINARY(16) NULL');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            Schema::table('login_audit_log', function (Blueprint $table) {
                $table->dropColumn('ip_address');
            });
            Schema::table('login_audit_log', function (Blueprint $table) {
                $table->string('ip_address', 45)->nullable()->after('email');
            });
        } else {
            // MySQL / MariaDB: revert VARBINARY(16) back to VARCHAR(45).
            // Change the column type first, then decode binary values to strings.
            DB::statement('ALTER TABLE login_audit_log MODIFY ip_address VARCHAR(45) NULL');
            DB::statement(<<<'SQL'
                UPDATE login_audit_log
                SET ip_address = IF(
                    LENGTH(ip_address) = 16,
                    INET6_NTOA(ip_address),
                    INET_NTOA(ip_address)
                )
                WHERE ip_address IS NOT NULL
            SQL);
        }
    }
};
