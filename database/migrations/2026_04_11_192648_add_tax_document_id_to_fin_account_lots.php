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
            $table->unsignedBigInteger('tax_document_id')->nullable()->after('close_t_id');
            $table->foreign('tax_document_id')->references('id')->on('fin_tax_documents')->nullOnDelete();
            $table->index('tax_document_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropForeign(['tax_document_id']);
            $table->dropIndex(['tax_document_id']);
            $table->dropColumn('tax_document_id');
        });
    }
};
