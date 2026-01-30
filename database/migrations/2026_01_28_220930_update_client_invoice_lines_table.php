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
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            // Only add line_date if it doesn't exist (sqlite schema already has it)
            if (!Schema::hasColumn('client_invoice_lines', 'line_date')) {
                $table->date('line_date')->nullable()->after('hours');
            }
        });
        
        // Note: enum change is not supported in SQLite, only run on MySQL
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            Schema::table('client_invoice_lines', function (Blueprint $table) {
                $table->enum('line_type', ['retainer', 'additional_hours', 'expense', 'adjustment', 'credit', 'prior_month_retainer', 'prior_month_billable'])
                    ->default('retainer')
                    ->change();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            if (Schema::hasColumn('client_invoice_lines', 'line_date')) {
                $table->dropColumn('line_date');
            }
        });
        
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            Schema::table('client_invoice_lines', function (Blueprint $table) {
                $table->enum('line_type', ['retainer', 'additional_hours', 'expense', 'adjustment', 'credit'])
                    ->default('retainer')
                    ->change();
            });
        }
    }
};