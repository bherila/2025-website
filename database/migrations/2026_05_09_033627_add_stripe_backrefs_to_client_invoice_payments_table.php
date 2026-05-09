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
        Schema::table('client_invoice_payments', function (Blueprint $table) {
            $table->foreignId('client_invoice_stripe_payment_id')
                ->nullable()
                ->after('notes')
                ->constrained('client_invoice_stripe_payments')
                ->nullOnDelete();
            $table->string('stripe_payment_intent_id')
                ->nullable()
                ->after('client_invoice_stripe_payment_id')
                ->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_invoice_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('client_invoice_stripe_payment_id');
            $table->dropIndex('client_invoice_payments_stripe_payment_intent_id_index');
            $table->dropColumn('stripe_payment_intent_id');
        });
    }
};
