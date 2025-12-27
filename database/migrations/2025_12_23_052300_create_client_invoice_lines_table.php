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
        Schema::create('client_invoice_lines', function (Blueprint $table) {
            $table->id('client_invoice_line_id');
            $table->unsignedBigInteger('client_invoice_id');
            $table->foreign('client_invoice_id')
                ->references('client_invoice_id')
                ->on('client_invoices')
                ->onDelete('cascade');

            // Line item details
            $table->string('description');
            $table->decimal('quantity', 10, 4)->default(1);
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->decimal('line_total', 10, 2)->default(0);

            // Type of line item
            $table->enum('line_type', ['retainer', 'additional_hours', 'expense', 'adjustment', 'credit'])->default('retainer');

            // Hours tracking (for hours-based line items)
            $table->decimal('hours', 10, 4)->nullable();

            $table->integer('sort_order')->default(0);

            $table->timestamps();
            $table->softDeletes();

            $table->index('client_invoice_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_invoice_lines');
    }
};
