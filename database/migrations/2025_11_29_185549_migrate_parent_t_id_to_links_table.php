<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Migrates existing parent_t_id relationships to the new links table.
     * The parent_t_id column stored the parent transaction's ID on the child transaction,
     * so we need to insert records with parent_t_id as parent and t_id as child.
     */
    public function up(): void
    {
        // Migrate existing parent_t_id relationships to the links table using query builder
        // for cross-database compatibility (MySQL, SQLite, etc.)
        $now = Carbon::now();

        $linksToInsert = DB::table('fin_account_line_items')
            ->whereNotNull('parent_t_id')
            ->select('parent_t_id', 't_id')
            ->get();

        foreach ($linksToInsert as $link) {
            DB::table('fin_account_line_item_links')->insert([
                'parent_t_id' => $link->parent_t_id,
                'child_t_id' => $link->t_id,
                'when_added' => $now,
            ]);
        }
    }

    /**
     * Reverse the migrations.
     *
     * Restores parent_t_id values from the links table back to the original column.
     */
    public function down(): void
    {
        // Restore parent_t_id values from links table using query builder
        // for cross-database compatibility
        $links = DB::table('fin_account_line_item_links')
            ->whereNull('when_deleted')
            ->get();

        foreach ($links as $link) {
            DB::table('fin_account_line_items')
                ->where('t_id', $link->child_t_id)
                ->update(['parent_t_id' => $link->parent_t_id]);
        }

        // Clear the links table
        DB::table('fin_account_line_item_links')->truncate();
    }
};
