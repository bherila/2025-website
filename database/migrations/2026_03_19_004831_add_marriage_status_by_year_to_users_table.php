<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adds marriage_status_by_year JSON blob to users table.
     * Stores { "2024": true, "2025": false } etc.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('marriage_status_by_year')->nullable()->after('gemini_api_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('marriage_status_by_year');
        });
    }
};
