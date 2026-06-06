<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Harden share resolution against legacy data.
     *
     * Before the "single private latest + editable share links" model, every saved comparison was
     * stored with a non-null short_code regardless of whether it was ever shared. Share lookup now
     * requires `is_snapshot = true`, so those unpublished private rows are already unreachable as
     * shares; this backfill additionally clears their short_code so a private row holds no code at
     * all. That is defense in depth, and it also restores owner visibility because the home page
     * loads the user's latest by its NULL short_code.
     *
     * Deliberately published shares (`is_snapshot = true`) keep their code and stay reachable. Any
     * row published as a share before this change but written with `is_snapshot = false` is already
     * no longer resolvable after the code change; clearing its code here causes no further loss, and
     * such a share can simply be re-created.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('opportunity_cost_comparisons', 'is_snapshot')) {
            return;
        }

        DB::table('opportunity_cost_comparisons')
            ->where('is_snapshot', false)
            ->whereNotNull('short_code')
            ->update(['short_code' => null]);
    }

    public function down(): void
    {
        // Irreversible: the original per-row short codes are not retained.
    }
};
