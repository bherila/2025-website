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
            $table->string('form_8949_box', 1)->nullable()->after('tax_document_id');
            $table->boolean('is_covered')->nullable()->after('form_8949_box');
            $table->decimal('accrued_market_discount', 18, 4)->nullable()->after('is_covered');
            $table->decimal('wash_sale_disallowed', 18, 4)->nullable()->after('accrued_market_discount');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropColumn([
                'form_8949_box',
                'is_covered',
                'accrued_market_discount',
                'wash_sale_disallowed',
            ]);
        });
    }
};
