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
     * This migration:
     * 1. Renames fin_account_balance_snapshot to fin_statements
     * 2. Renames snapshot_id to statement_id in all related tables
     * 3. Renames when_added to statement_closing_date (DATE type)
     * 4. Adds statement_opening_date field (DATE type)
     */
    public function up(): void
    {
        // Step 1: Drop foreign key constraints from child tables
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });
        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });
        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });
        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });
        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });
        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->dropForeign(['snapshot_id']);
        });

        // Step 2: Rename the main table
        Schema::rename('fin_account_balance_snapshot', 'fin_statements');

        // Step 3: Rename snapshot_id to statement_id in main table and add new columns
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });

        // Step 4: Add new date columns and migrate data
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->date('statement_opening_date')->nullable()->after('balance');
            $table->date('statement_closing_date')->nullable()->after('statement_opening_date');
        });

        // Migrate when_added data to statement_closing_date
        DB::statement('UPDATE fin_statements SET statement_closing_date = DATE(when_added)');

        // Drop the old when_added column
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->dropColumn('when_added');
        });

        // Step 5: Rename snapshot_id to statement_id in child tables and recreate foreign keys
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });

        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });

        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });

        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });

        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });

        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->renameColumn('snapshot_id', 'statement_id');
        });
        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Step 1: Drop foreign key constraints from child tables
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });
        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });
        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });
        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });
        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });
        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
        });

        // Step 2: Rename statement_id back to snapshot_id in child tables
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });
        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });
        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });
        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });
        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });
        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });

        // Step 3: Add back when_added column and migrate data
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->timestamp('when_added')->nullable()->after('balance');
        });

        // Migrate statement_closing_date data back to when_added
        DB::statement('UPDATE fin_statements SET when_added = statement_closing_date');

        // Set default for when_added
        DB::statement('ALTER TABLE fin_statements MODIFY when_added TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

        // Drop the new date columns
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->dropColumn(['statement_opening_date', 'statement_closing_date']);
        });

        // Step 4: Rename statement_id back to snapshot_id in main table
        Schema::table('fin_statements', function (Blueprint $table) {
            $table->renameColumn('statement_id', 'snapshot_id');
        });

        // Step 5: Rename the main table back
        Schema::rename('fin_statements', 'fin_account_balance_snapshot');

        // Step 6: Recreate foreign keys with old table name
        Schema::table('fin_statement_details', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
        Schema::table('fin_statement_nav', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
        Schema::table('fin_statement_cash_report', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
        Schema::table('fin_statement_positions', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
        Schema::table('fin_statement_performance', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
        Schema::table('fin_statement_securities_lent', function (Blueprint $table) {
            $table->foreign('snapshot_id')->references('snapshot_id')->on('fin_account_balance_snapshot')->onDelete('cascade');
        });
    }
};
