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
        Schema::table('client_tasks', function (Blueprint $table) {
            // Milestone price for billing (0.00 means not a billable milestone)
            $table->decimal('milestone_price', 10, 2)->default(0.00)->after('is_hidden_from_clients');
            // Reference to the invoice line this task was billed on (null if not yet billed)
            $table->unsignedBigInteger('client_invoice_line_id')->nullable()->after('milestone_price');
            $table->foreign('client_invoice_line_id')
                ->references('client_invoice_line_id')
                ->on('client_invoice_lines')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_tasks', function (Blueprint $table) {
            $table->dropForeign(['client_invoice_line_id']);
            $table->dropColumn(['milestone_price', 'client_invoice_line_id']);
        });
    }
};
