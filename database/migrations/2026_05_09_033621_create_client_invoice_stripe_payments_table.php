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
        Schema::create('client_invoice_stripe_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_invoice_id')
                ->constrained('client_invoices', 'client_invoice_id')
                ->cascadeOnDelete();
            $table->string('stripe_payment_intent_id')->unique();
            $table->string('stripe_customer_id');
            $table->string('stripe_payment_method_id')->nullable();
            $table->unsignedInteger('amount');
            $table->string('status', 32);
            $table->text('failure_reason')->nullable();
            $table->string('last_event_id')->nullable();
            $table->timestamps();

            $table->index(['client_invoice_id', 'status']);
            $table->index('stripe_customer_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_invoice_stripe_payments');
    }
};
