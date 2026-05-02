<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_ai_configurations', function (Blueprint $table) {
            $table->timestamp('api_key_invalid_at')->nullable()->after('expires_at');
            $table->text('api_key_invalid_reason')->nullable()->after('api_key_invalid_at');
        });
    }

    public function down(): void
    {
        Schema::table('user_ai_configurations', function (Blueprint $table) {
            $table->dropColumn(['api_key_invalid_at', 'api_key_invalid_reason']);
        });
    }
};
