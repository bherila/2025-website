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
        Schema::table('fin_account_tag', function (Blueprint $table) {
            $table->string('tax_characteristic', 100)->nullable()->after('tag_label');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_tag', function (Blueprint $table) {
            $table->dropColumn('tax_characteristic');
        });
    }
};
