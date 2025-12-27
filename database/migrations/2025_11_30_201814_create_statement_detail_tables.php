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
        // Net Asset Value breakdown
        Schema::create('fin_statement_nav', function (Blueprint $table) {
            $table->id('nav_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->string('asset_class', 50);
            $table->decimal('prior_total', 18, 4)->nullable();
            $table->decimal('current_long', 18, 4)->nullable();
            $table->decimal('current_short', 18, 4)->nullable();
            $table->decimal('current_total', 18, 4)->nullable();
            $table->decimal('change_amount', 18, 4)->nullable();

            $table->index('snapshot_id');
            $table->foreign('snapshot_id')
                ->references('snapshot_id')
                ->on('fin_account_balance_snapshot')
                ->onDelete('cascade');
        });

        // Cash Report
        Schema::create('fin_statement_cash_report', function (Blueprint $table) {
            $table->id('cash_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->string('currency', 20);
            $table->string('line_item', 100);
            $table->decimal('total', 18, 4)->nullable();
            $table->decimal('securities', 18, 4)->nullable();
            $table->decimal('futures', 18, 4)->nullable();

            $table->index('snapshot_id');
            $table->foreign('snapshot_id')
                ->references('snapshot_id')
                ->on('fin_account_balance_snapshot')
                ->onDelete('cascade');
        });

        // Open Positions snapshot
        Schema::create('fin_statement_positions', function (Blueprint $table) {
            $table->id('position_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->string('asset_category', 50)->nullable();
            $table->string('currency', 10)->nullable();
            $table->string('symbol', 50);
            $table->decimal('quantity', 18, 8)->nullable();
            $table->integer('multiplier')->default(1);
            $table->decimal('cost_price', 18, 8)->nullable();
            $table->decimal('cost_basis', 18, 4)->nullable();
            $table->decimal('close_price', 18, 8)->nullable();
            $table->decimal('market_value', 18, 4)->nullable();
            $table->decimal('unrealized_pl', 18, 4)->nullable();
            $table->enum('opt_type', ['call', 'put'])->nullable();
            $table->string('opt_strike', 20)->nullable();
            $table->date('opt_expiration')->nullable();

            $table->index('snapshot_id');
            $table->index('symbol');
            $table->foreign('snapshot_id')
                ->references('snapshot_id')
                ->on('fin_account_balance_snapshot')
                ->onDelete('cascade');
        });

        // Performance summary (Mark-to-Market and Realized/Unrealized)
        Schema::create('fin_statement_performance', function (Blueprint $table) {
            $table->id('perf_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->enum('perf_type', ['mtm', 'realized_unrealized']);
            $table->string('asset_category', 50)->nullable();
            $table->string('symbol', 50);
            $table->decimal('prior_quantity', 18, 8)->nullable();
            $table->decimal('current_quantity', 18, 8)->nullable();
            $table->decimal('prior_price', 18, 8)->nullable();
            $table->decimal('current_price', 18, 8)->nullable();
            // Mark-to-Market columns
            $table->decimal('mtm_pl_position', 18, 4)->nullable();
            $table->decimal('mtm_pl_transaction', 18, 4)->nullable();
            $table->decimal('mtm_pl_commissions', 18, 4)->nullable();
            $table->decimal('mtm_pl_other', 18, 4)->nullable();
            $table->decimal('mtm_pl_total', 18, 4)->nullable();
            // Realized/Unrealized columns
            $table->decimal('cost_adj', 18, 4)->nullable();
            $table->decimal('realized_st_profit', 18, 4)->nullable();
            $table->decimal('realized_st_loss', 18, 4)->nullable();
            $table->decimal('realized_lt_profit', 18, 4)->nullable();
            $table->decimal('realized_lt_loss', 18, 4)->nullable();
            $table->decimal('realized_total', 18, 4)->nullable();
            $table->decimal('unrealized_st_profit', 18, 4)->nullable();
            $table->decimal('unrealized_st_loss', 18, 4)->nullable();
            $table->decimal('unrealized_lt_profit', 18, 4)->nullable();
            $table->decimal('unrealized_lt_loss', 18, 4)->nullable();
            $table->decimal('unrealized_total', 18, 4)->nullable();
            $table->decimal('total_pl', 18, 4)->nullable();

            $table->index('snapshot_id');
            $table->index('symbol');
            $table->foreign('snapshot_id')
                ->references('snapshot_id')
                ->on('fin_account_balance_snapshot')
                ->onDelete('cascade');
        });

        // Securities Lending (Stock Yield Enhancement Program)
        Schema::create('fin_statement_securities_lent', function (Blueprint $table) {
            $table->id('lent_id');
            $table->unsignedBigInteger('snapshot_id');
            $table->string('symbol', 50);
            $table->date('start_date')->nullable();
            $table->decimal('fee_rate', 10, 6)->nullable();
            $table->decimal('quantity', 18, 8)->nullable();
            $table->decimal('collateral_amount', 18, 4)->nullable();
            $table->decimal('interest_earned', 18, 4)->nullable();

            $table->index('snapshot_id');
            $table->foreign('snapshot_id')
                ->references('snapshot_id')
                ->on('fin_account_balance_snapshot')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fin_statement_securities_lent');
        Schema::dropIfExists('fin_statement_performance');
        Schema::dropIfExists('fin_statement_positions');
        Schema::dropIfExists('fin_statement_cash_report');
        Schema::dropIfExists('fin_statement_nav');
    }
};
