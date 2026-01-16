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
        Schema::table('utility_bill', function (Blueprint $table) {
            $table->decimal('discounts', 13, 4)->nullable()->after('fees');
            $table->decimal('credits', 13, 4)->nullable()->after('discounts');
            $table->decimal('payments_received', 13, 4)->nullable()->after('credits');
            $table->decimal('previous_unpaid_balance', 13, 4)->nullable()->after('payments_received');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('utility_bill', function (Blueprint $table) {
            $table->dropColumn(['discounts', 'credits', 'payments_received', 'previous_unpaid_balance']);
        });
    }
};