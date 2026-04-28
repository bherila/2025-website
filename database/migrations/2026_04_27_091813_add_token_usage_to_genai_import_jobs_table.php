<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('genai_import_jobs', function (Blueprint $table) {
            $table->unsignedBigInteger('ai_configuration_id')->nullable()->after('user_id');
            $table->unsignedInteger('input_tokens')->nullable()->after('parsed_at');
            $table->unsignedInteger('output_tokens')->nullable()->after('input_tokens');

            $table->index('ai_configuration_id');

            $table->foreign('ai_configuration_id')
                ->references('id')
                ->on('user_ai_configurations')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('genai_import_jobs', function (Blueprint $table) {
            $table->dropForeign(['ai_configuration_id']);
            $table->dropColumn(['ai_configuration_id', 'input_tokens', 'output_tokens']);
        });
    }
};
