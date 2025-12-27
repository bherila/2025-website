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
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            $table->unsignedBigInteger('client_agreement_id')->nullable()->after('client_invoice_id');
            $table->foreign('client_agreement_id')
                ->references('id')
                ->on('client_agreements')
                ->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            $table->dropForeign(['client_agreement_id']);
            $table->dropColumn('client_agreement_id');
        });
    }
};
