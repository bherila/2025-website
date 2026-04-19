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
        Schema::table('client_time_entries', function (Blueprint $table) {
            $table->boolean('is_deferred_billing')
                ->default(false)
                ->after('is_billable')
                ->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_time_entries', function (Blueprint $table) {
            $table->dropIndex(['is_deferred_billing']);
            $table->dropColumn('is_deferred_billing');
        });
    }
};
