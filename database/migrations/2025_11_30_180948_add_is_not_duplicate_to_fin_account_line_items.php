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
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->boolean('t_is_not_duplicate')->default(false)->after('t_harvested_amount')
                ->comment('When true, this transaction has been verified as not a duplicate');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->dropColumn('t_is_not_duplicate');
        });
    }
};
