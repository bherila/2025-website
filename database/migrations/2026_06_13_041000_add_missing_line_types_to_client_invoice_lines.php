<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds 'milestone', 'recurring_item', and 'reconciliation' values to the
     * client_invoice_lines.line_type ENUM. These were added to InvoiceLineType
     * without a matching schema change, causing invoice generation to fail with
     * a MySQL data-truncation error for any company with billable milestone tasks.
     */
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE client_invoice_lines MODIFY COLUMN line_type ENUM('retainer','additional_hours','expense','adjustment','credit','prior_month_retainer','prior_month_billable','milestone','recurring_item','reconciliation') NOT NULL DEFAULT 'retainer'");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE client_invoice_lines MODIFY COLUMN line_type ENUM('retainer','additional_hours','expense','adjustment','credit','prior_month_retainer','prior_month_billable') NOT NULL DEFAULT 'retainer'");
        }
    }
};
