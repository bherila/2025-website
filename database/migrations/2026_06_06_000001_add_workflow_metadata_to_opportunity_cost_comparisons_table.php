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
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->string('title')->nullable()->after('user_id');
            $table->boolean('is_snapshot')->default(true)->after('title');
            $table->timestamp('last_active_at')->nullable()->after('is_snapshot');

            $table->index(['user_id', 'is_snapshot', 'last_active_at'], 'occ_user_snapshot_active_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opportunity_cost_comparisons', function (Blueprint $table): void {
            $table->dropIndex('occ_user_snapshot_active_idx');
            $table->dropColumn(['title', 'is_snapshot', 'last_active_at']);
        });
    }
};
