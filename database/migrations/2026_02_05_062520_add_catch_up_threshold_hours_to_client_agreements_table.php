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
        Schema::table('client_agreements', function (Blueprint $table) {
            // Check if column doesn't exist before adding
            if (!Schema::hasColumn('client_agreements', 'catch_up_threshold_hours')) {
                // Add catch_up_threshold_hours column with default of 1.0
                // This represents the minimum hours that must be available after applying retainer
                // Range: 0 to monthly_retainer_hours (validated in model/API)
                $table->decimal('catch_up_threshold_hours', 8, 2)
                    ->default(1.00)
                    ->after('monthly_retainer_hours');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_agreements', function (Blueprint $table) {
            $table->dropColumn('catch_up_threshold_hours');
        });
    }
};
