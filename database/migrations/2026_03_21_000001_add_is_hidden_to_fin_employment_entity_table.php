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
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('ALTER TABLE fin_employment_entity ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
        } else {
            Schema::table('fin_employment_entity', function (Blueprint $table) {
                $table->boolean('is_hidden')->default(false)->after('is_spouse');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('fin_employment_entity', function (Blueprint $table) {
                $table->dropColumn('is_hidden');
            });
        }
    }
};
