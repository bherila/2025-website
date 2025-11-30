<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Add columns for Interactive Brokers specific data:
     * - conid: IB's internal contract ID for the instrument
     * - underlying: Underlying symbol for options
     * - listing_exch: Exchange where instrument is listed
     * - multiplier: Contract multiplier (100 for standard options)
     * - t_basis: Cost basis for the position
     * - t_realized_pl: Realized profit/loss from the trade
     * - t_mtm_pl: Mark-to-market profit/loss
     */
    public function up(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            // IB instrument identification
            $table->string('conid', 50)->nullable()->after('t_cusip');
            $table->string('underlying', 20)->nullable()->after('conid');
            $table->string('listing_exch', 50)->nullable()->after('underlying');

            // Contract details
            $table->integer('multiplier')->nullable()->after('listing_exch');

            // P&L fields
            $table->decimal('t_basis', 13, 4)->nullable()->after('t_fee');
            $table->decimal('t_realized_pl', 13, 4)->nullable()->after('t_basis');
            $table->decimal('t_mtm_pl', 13, 4)->nullable()->after('t_realized_pl');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_line_items', function (Blueprint $table) {
            $table->dropColumn([
                'conid',
                'underlying',
                'listing_exch',
                'multiplier',
                't_basis',
                't_realized_pl',
                't_mtm_pl',
            ]);
        });
    }
};
