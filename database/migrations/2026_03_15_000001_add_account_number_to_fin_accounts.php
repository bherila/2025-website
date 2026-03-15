<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_accounts', function (Blueprint $table) {
            $table->string('acct_number')->nullable()->after('acct_name');
        });
    }

    public function down(): void
    {
        Schema::table('fin_accounts', function (Blueprint $table) {
            $table->dropColumn('acct_number');
        });
    }
};
