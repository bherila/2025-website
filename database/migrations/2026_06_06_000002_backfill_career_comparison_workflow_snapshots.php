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
        if (! Schema::hasColumn('opportunity_cost_comparisons', 'is_snapshot')) {
            return;
        }

        // Rows created before #844 introduced the snapshot/workflow split were
        // all user-owned saved comparisons. Later authenticated share snapshots
        // can also have user_id, so keep the cutoff explicit instead of
        // reclassifying every user-owned snapshot forever.
        DB::table('opportunity_cost_comparisons')
            ->whereNotNull('user_id')
            ->where('created_at', '<', '2026-06-06 04:28:28')
            ->update(['is_snapshot' => false]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This data repair is intentionally irreversible. New share snapshots
        // may also be user-owned, so there is no safe down migration.
    }
};
