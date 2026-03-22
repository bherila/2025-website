<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            // SQLite doesn't handle ALTER TABLE ADD COLUMN with foreign keys well
            // Use raw SQL to add the column
            DB::statement('ALTER TABLE fin_payslip ADD COLUMN employment_entity_id INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL');
        } else {
            Schema::table('fin_payslip', function ($table) {
                $table->unsignedBigInteger('employment_entity_id')->nullable()->after('uid');
                $table->foreign('employment_entity_id')
                    ->references('id')
                    ->on('fin_employment_entity')
                    ->onDelete('set null');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            // SQLite doesn't support DROP COLUMN in older versions; rely on migration rollback
            // For newer SQLite (3.35+), this works:
            DB::statement('ALTER TABLE fin_payslip DROP COLUMN employment_entity_id');
        } else {
            Schema::table('fin_payslip', function ($table) {
                $table->dropForeign(['employment_entity_id']);
                $table->dropColumn('employment_entity_id');
            });
        }
    }
};
