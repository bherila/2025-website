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
            $table->string('cusip', 20)->nullable()->after('description');
            $table->index('cusip');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropIndex(['cusip']);
            $table->dropColumn('cusip');
        });
    }
};
