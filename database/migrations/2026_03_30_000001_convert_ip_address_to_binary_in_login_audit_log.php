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
     * - MySQL: convert existing string IPs via INET6_ATON, then ALTER to VARBINARY(16)
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
            // INET6_ATON() handles both plain dotted-quad IPv4 (stores 4 bytes) and any
            // address written in IPv6 form, including IPv4-mapped IPv6 like ::ffff:127.0.0.1
            // (stores 16 bytes). This mirrors PHP's inet_pton() behavior used by IpAddressCast.
            DB::statement(<<<'SQL'
                UPDATE login_audit_log
                SET ip_address = INET6_ATON(ip_address)
                WHERE ip_address IS NOT NULL
            SQL);

            // VARBINARY(16): variable length, up to 16 bytes.
            // IPv4 uses 4 bytes; IPv6 uses 16 bytes — both handled by INET6_ATON().
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
            // MySQL / MariaDB: decode binary values back to strings while the column is
            // still VARBINARY, then change the column type back to VARCHAR(45).
            // INET_NTOA() expects an integer, so 4-byte values must be converted via HEX/CONV.
            DB::statement(<<<'SQL'
                UPDATE login_audit_log
                SET ip_address = CASE
                    WHEN LENGTH(ip_address) = 16 THEN INET6_NTOA(ip_address)
                    WHEN LENGTH(ip_address) = 4  THEN INET_NTOA(CONV(HEX(ip_address), 16, 10))
                    ELSE NULL
                END
                WHERE ip_address IS NOT NULL
            SQL);
            DB::statement('ALTER TABLE login_audit_log MODIFY ip_address VARCHAR(45) NULL');
        }
    }
};
