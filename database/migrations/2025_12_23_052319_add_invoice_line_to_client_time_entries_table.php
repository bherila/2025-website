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
        Schema::table('client_time_entries', function (Blueprint $table) {
            $table->unsignedBigInteger('client_invoice_line_id')->nullable()->after('job_type');
            $table->foreign('client_invoice_line_id')
                  ->references('client_invoice_line_id')
                  ->on('client_invoice_lines')
                  ->onDelete('restrict');
            $table->index('client_invoice_line_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_time_entries', function (Blueprint $table) {
            $table->dropForeign(['client_invoice_line_id']);
            $table->dropColumn('client_invoice_line_id');
        });
    }
};
