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
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->unsignedBigInteger('superseded_by_lot_id')->nullable()->after('tax_document_id');
            $table->string('reconciliation_status', 32)->nullable()->after('superseded_by_lot_id');
            $table->text('reconciliation_notes')->nullable()->after('reconciliation_status');

            $table->foreign('superseded_by_lot_id')->references('lot_id')->on('fin_account_lots')->nullOnDelete();
            $table->index('superseded_by_lot_id');
            $table->index('reconciliation_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropForeign(['superseded_by_lot_id']);
            $table->dropIndex(['superseded_by_lot_id']);
            $table->dropIndex(['reconciliation_status']);
            $table->dropColumn(['superseded_by_lot_id', 'reconciliation_status', 'reconciliation_notes']);
        });
    }
};
