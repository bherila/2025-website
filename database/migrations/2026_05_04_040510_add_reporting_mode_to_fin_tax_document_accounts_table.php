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
        Schema::table('fin_tax_document_accounts', function (Blueprint $table) {
            $table->string('reporting_mode', 32)->nullable()->after('misc_routing');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_tax_document_accounts', function (Blueprint $table) {
            $table->dropColumn('reporting_mode');
        });
    }
};
