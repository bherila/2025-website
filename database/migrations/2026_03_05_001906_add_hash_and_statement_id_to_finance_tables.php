<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('files_for_fin_accounts', function (Blueprint $table) {
            $table->string('file_hash', 64)->nullable()->after('acct_id')->index();
        });

        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->unsignedBigInteger('statement_id')->nullable()->after('t_account')->index();
            $table->foreign('statement_id')->references('statement_id')->on('fin_statements')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->dropForeign(['statement_id']);
            $table->dropColumn('statement_id');
        });

        Schema::table('files_for_fin_accounts', function (Blueprint $table) {
            $table->dropColumn('file_hash');
        });
    }
};
