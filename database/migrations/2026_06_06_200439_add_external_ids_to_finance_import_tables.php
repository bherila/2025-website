<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table): void {
            $table->string('external_id', 128)->nullable()->after('statement_id');
            $table->index(['t_account', 't_source', 'external_id'], 'faili_acct_source_ext_idx');
        });

        Schema::table('fin_account_lots', function (Blueprint $table): void {
            $table->string('external_id', 128)->nullable()->after('source');
            $table->decimal('market_value', 18, 4)->nullable()->after('cost_per_unit');
            $table->decimal('snapshot_price', 18, 8)->nullable()->after('market_value');
            $table->date('snapshot_date')->nullable()->after('snapshot_price');
            $table->index(['acct_id', 'source', 'external_id'], 'fal_acct_source_ext_idx');
        });
    }

    public function down(): void
    {
        Schema::table('fin_account_lots', function (Blueprint $table): void {
            $table->dropIndex('fal_acct_source_ext_idx');
            $table->dropColumn(['external_id', 'market_value', 'snapshot_price', 'snapshot_date']);
        });

        Schema::table('fin_account_line_items', function (Blueprint $table): void {
            $table->dropIndex('faili_acct_source_ext_idx');
            $table->dropColumn('external_id');
        });
    }
};
