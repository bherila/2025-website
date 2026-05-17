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
        if (! Schema::hasColumn('client_companies', 'stripe_billing_enabled')) {
            Schema::table('client_companies', function (Blueprint $table) {
                $table->boolean('stripe_billing_enabled')
                    ->default(true)
                    ->after('is_active');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('client_companies', 'stripe_billing_enabled')) {
            Schema::table('client_companies', function (Blueprint $table) {
                $table->dropColumn('stripe_billing_enabled');
            });
        }
    }
};
