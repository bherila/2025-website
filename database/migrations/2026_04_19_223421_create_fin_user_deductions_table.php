<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::createIfNotExists('fin_user_deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedSmallInteger('tax_year');
            // Category drives which Schedule A line this belongs to.
            // Allowed values: 'real_estate_tax', 'state_est_tax', 'sales_tax',
            //                 'mortgage_interest', 'charitable_cash', 'charitable_noncash', 'other'
            $table->string('category', 40);
            $table->string('description')->nullable(); // e.g. "123 Main St property tax"
            $table->decimal('amount', 12, 2);
            $table->timestamps();

            $table->index(['user_id', 'tax_year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_user_deductions');
    }
};
