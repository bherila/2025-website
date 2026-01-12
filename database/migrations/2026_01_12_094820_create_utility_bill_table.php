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
        Schema::create('utility_bill', function (Blueprint $table) {
            $table->id();
            $table->foreignId('utility_account_id')->constrained('utility_account')->onDelete('cascade');
            $table->date('bill_start_date');
            $table->date('bill_end_date');
            $table->date('due_date');
            $table->decimal('total_cost', 14, 5);
            $table->string('status')->default('Unpaid'); // 'Paid' or 'Unpaid'
            $table->text('notes')->nullable();
            // Electricity-specific fields (nullable for General accounts)
            $table->decimal('power_consumed_kwh', 14, 5)->nullable();
            $table->decimal('total_generation_fees', 14, 5)->nullable();
            $table->decimal('total_delivery_fees', 14, 5)->nullable();
            $table->timestamps();
            
            $table->index('utility_account_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('utility_bill');
    }
};
