<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->unsignedBigInteger('open_t_id')->nullable()->after('statement_id')
                ->comment('Transaction that opened this lot (buy)');
            $table->unsignedBigInteger('close_t_id')->nullable()->after('open_t_id')
                ->comment('Transaction that closed this lot (sell)');

            $table->foreign('open_t_id')->references('t_id')->on('fin_account_line_items')->onDelete('set null');
            $table->foreign('close_t_id')->references('t_id')->on('fin_account_line_items')->onDelete('set null');
            $table->index('open_t_id');
            $table->index('close_t_id');
        });
    }

    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table) {
            $table->dropForeign(['open_t_id']);
            $table->dropForeign(['close_t_id']);
            $table->dropIndex(['open_t_id']);
            $table->dropIndex(['close_t_id']);
            $table->dropColumn(['open_t_id', 'close_t_id']);
        });
    }
};
