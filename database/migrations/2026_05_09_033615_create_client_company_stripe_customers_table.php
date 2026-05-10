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
        Schema::create('client_company_stripe_customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_company_id')
                ->unique()
                ->constrained('client_companies')
                ->cascadeOnDelete();
            $table->string('stripe_customer_id')->unique();
            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_company_stripe_customers');
    }
};
