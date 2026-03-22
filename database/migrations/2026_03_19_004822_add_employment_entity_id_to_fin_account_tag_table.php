<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
            DB::statement('ALTER TABLE fin_account_tag ADD COLUMN employment_entity_id INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL');
        } else {
            Schema::table('fin_account_tag', function (Blueprint $table) {
                $table->unsignedBigInteger('employment_entity_id')->nullable()->after('tax_characteristic');
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
            DB::statement('ALTER TABLE fin_account_tag DROP COLUMN employment_entity_id');
        } else {
            Schema::table('fin_account_tag', function (Blueprint $table) {
                $table->dropForeign(['employment_entity_id']);
                $table->dropColumn('employment_entity_id');
            });
        }
    }
};
