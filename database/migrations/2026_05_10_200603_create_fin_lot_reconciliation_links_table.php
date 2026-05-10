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
        Schema::create('fin_lot_reconciliation_links', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tax_document_id')->nullable();
            $table->unsignedBigInteger('broker_lot_id')->nullable();
            $table->unsignedBigInteger('account_lot_id')->nullable();
            $table->string('state', 32);
            $table->json('match_reason')->nullable();
            $table->unsignedBigInteger('accepted_by_user_id')->nullable();
            $table->dateTime('accepted_at')->nullable();
            $table->timestamps();

            $table->foreign('tax_document_id', 'flrl_tax_doc_fk')
                ->references('id')
                ->on('fin_tax_documents')
                ->nullOnDelete();
            $table->foreign('broker_lot_id', 'flrl_broker_lot_fk')
                ->references('lot_id')
                ->on('fin_account_lots')
                ->cascadeOnDelete();
            $table->foreign('account_lot_id', 'flrl_account_lot_fk')
                ->references('lot_id')
                ->on('fin_account_lots')
                ->nullOnDelete();
            $table->foreign('accepted_by_user_id', 'flrl_accepted_user_fk')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->index('tax_document_id', 'fin_lot_recon_tax_doc_idx');
            $table->index('broker_lot_id', 'fin_lot_recon_broker_lot_idx');
            $table->index('account_lot_id', 'fin_lot_recon_account_lot_idx');
            $table->index('state', 'fin_lot_recon_state_idx');
            $table->index('accepted_by_user_id', 'fin_lot_recon_accepted_by_idx');
            $table->unique(['broker_lot_id', 'account_lot_id'], 'fin_lot_recon_lot_pair_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_lot_reconciliation_links');
    }
};
