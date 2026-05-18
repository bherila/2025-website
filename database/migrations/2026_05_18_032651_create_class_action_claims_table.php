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
        Schema::create('class_action_claims', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->date('notification_received_on')->nullable();
            $table->longText('notification_email_copy')->nullable();
            $table->string('class_action_url', 2048)->nullable();
            $table->date('payment_election_submitted_on')->nullable();
            $table->boolean('payment_received')->default(false);
            $table->date('payment_received_on')->nullable();
            $table->unsignedBigInteger('payment_fin_transaction_id')->nullable();
            $table->longText('notes')->nullable();
            $table->timestamps();

            $table->foreign('payment_fin_transaction_id', 'cac_payment_tx_fk')
                ->references('t_id')
                ->on('fin_account_line_items')
                ->nullOnDelete();

            $table->index(['user_id', 'notification_received_on'], 'cac_user_notified_idx');
            $table->index(['user_id', 'payment_received'], 'cac_user_payment_idx');
            $table->index('payment_fin_transaction_id', 'cac_payment_tx_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('class_action_claims');
    }
};
