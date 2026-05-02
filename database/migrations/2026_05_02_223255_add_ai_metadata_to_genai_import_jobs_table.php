<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('genai_import_jobs', function (Blueprint $table) {
            $table->string('ai_provider', 32)->nullable()->after('ai_configuration_id');
            $table->string('ai_model', 255)->nullable()->after('ai_provider');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('genai_import_jobs', function (Blueprint $table) {
            $table->dropColumn(['ai_provider', 'ai_model']);
        });
    }
};
