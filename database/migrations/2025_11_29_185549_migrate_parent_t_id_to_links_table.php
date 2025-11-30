<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
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
        // Migrate existing parent_t_id relationships to the links table
        DB::statement('
            INSERT INTO fin_account_line_item_links (parent_t_id, child_t_id, when_added)
            SELECT parent_t_id, t_id, NOW()
            FROM fin_account_line_items
            WHERE parent_t_id IS NOT NULL
        ');
    }

    /**
     * Reverse the migrations.
     * 
     * Restores parent_t_id values from the links table back to the original column.
     */
    public function down(): void
    {
        // Restore parent_t_id values from links table
        DB::statement('
            UPDATE fin_account_line_items fali
            INNER JOIN fin_account_line_item_links falil ON fali.t_id = falil.child_t_id
            SET fali.parent_t_id = falil.parent_t_id
            WHERE falil.when_deleted IS NULL
        ');

        // Clear the links table
        DB::table('fin_account_line_item_links')->truncate();
    }
};
