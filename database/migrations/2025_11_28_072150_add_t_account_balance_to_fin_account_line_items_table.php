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
            $table->decimal('t_account_balance', 13, 4)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->dropColumn('t_account_balance');
        });
    }
};
