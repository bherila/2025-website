<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_accounts', function (Blueprint $table): void {
            $table->decimal('expected_fee_pct', 7, 4)->nullable()->after('acct_is_retirement');
            $table->decimal('expected_fee_flat', 13, 2)->nullable()->after('expected_fee_pct');
            $table->string('expected_fee_notes', 255)->nullable()->after('expected_fee_flat');
        });
    }

    public function down(): void
    {
        Schema::table('fin_accounts', function (Blueprint $table): void {
            $table->dropColumn(['expected_fee_pct', 'expected_fee_flat', 'expected_fee_notes']);
        });
    }
};
