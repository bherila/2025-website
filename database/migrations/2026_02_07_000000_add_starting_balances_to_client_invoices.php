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
        Schema::table('client_invoices', function (Blueprint $table) {
            $table->decimal('starting_unused_hours', 12, 4)->nullable()->after('negative_hours_balance');
            $table->decimal('starting_negative_hours', 12, 4)->nullable()->after('starting_unused_hours');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_invoices', function (Blueprint $table) {
            $table->dropColumn(['starting_unused_hours', 'starting_negative_hours']);
        });
    }
};
