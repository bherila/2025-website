<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Skip if column already exists (e.g., created via schema file in tests)
        if (Schema::hasColumn('users', 'genai_daily_quota_limit')) {
            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('ALTER TABLE `users` ADD COLUMN `genai_daily_quota_limit` INTEGER DEFAULT NULL');
        } else {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedInteger('genai_daily_quota_limit')->nullable()->after('gemini_api_key')
                    ->comment('Per-user GenAI daily quota limit. NULL = use system default.');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('genai_daily_quota_limit');
            });
        }
    }
};
