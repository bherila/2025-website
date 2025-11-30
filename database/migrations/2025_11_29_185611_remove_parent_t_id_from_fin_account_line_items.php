<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Removes the legacy parent_t_id column after data has been migrated to the links table.
     */
    public function up(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            // Drop the foreign key first
            $table->dropForeign(['parent_t_id']);
            // Then drop the column
            $table->dropColumn('parent_t_id');
        });
    }

    /**
     * Reverse the migrations.
     * 
     * Restores the parent_t_id column for rollback purposes.
     */
    public function down(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_t_id')->nullable()->after('t_harvested_amount');
            $table->foreign('parent_t_id')
                ->references('t_id')
                ->on('fin_account_line_items')
                ->onDelete('set null');
        });
    }
};
