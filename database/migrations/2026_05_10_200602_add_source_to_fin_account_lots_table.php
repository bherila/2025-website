<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->string('source', 32)
                ->default('account_derived')
                ->after('lot_source');
            $table->index('source', 'fin_account_lots_source_idx');
        });

        DB::table('fin_account_lots')
            ->whereNotNull('tax_document_id')
            ->update(['source' => 'broker_1099b']);

        DB::table('fin_account_lots')
            ->whereNull('tax_document_id')
            ->update(['source' => 'account_derived']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropIndex('fin_account_lots_source_idx');
            $table->dropColumn('source');
        });
    }
};
