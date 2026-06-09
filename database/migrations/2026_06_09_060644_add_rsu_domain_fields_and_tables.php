<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->makeShareCountDecimal();

        Schema::table('fin_equity_awards', function (Blueprint $table): void {
            if (! Schema::hasColumn('fin_equity_awards', 'vest_price_source')) {
                $table->string('vest_price_source', 32)->nullable()->after('vest_price');
            }
            if (! Schema::hasColumn('fin_equity_awards', 'vest_price_fetched_at')) {
                $table->timestamp('vest_price_fetched_at')->nullable()->after('vest_price_source');
            }
            if (! Schema::hasColumn('fin_equity_awards', 'grant_price_source')) {
                $table->string('grant_price_source', 32)->nullable()->after('grant_price');
            }
            if (! Schema::hasColumn('fin_equity_awards', 'grant_price_fetched_at')) {
                $table->timestamp('grant_price_fetched_at')->nullable()->after('grant_price_source');
            }
        });

        DB::table('fin_equity_awards')
            ->whereNotNull('vest_price')
            ->whereNull('vest_price_source')
            ->update(['vest_price_source' => 'unknown']);

        DB::table('fin_equity_awards')
            ->whereNotNull('grant_price')
            ->whereNull('grant_price_source')
            ->update(['grant_price_source' => 'unknown']);

        Schema::create('fin_rsu_vest_settlements', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('uid');
            $table->date('vest_date');
            $table->string('symbol', 16);
            $table->decimal('vest_price', 18, 6)->nullable();
            $table->string('vest_price_source', 32)->nullable();
            $table->decimal('gross_shares', 18, 6);
            $table->decimal('gross_income', 18, 4);
            $table->decimal('withheld_shares_whole', 18, 6)->nullable();
            $table->decimal('withheld_value', 18, 4)->nullable();
            $table->decimal('actual_tax_remitted', 18, 4)->nullable();
            $table->decimal('excess_refund', 18, 4)->nullable();
            $table->unsignedBigInteger('brokerage_account_id')->nullable();
            $table->unsignedBigInteger('payslip_id')->nullable();
            $table->unsignedBigInteger('refund_payslip_id')->nullable();
            $table->string('status', 32)->default('suggested');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['uid', 'vest_date', 'symbol'], 'frvs_uid_date_symbol_idx');
            $table->foreign('uid', 'frvs_uid_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('brokerage_account_id', 'frvs_acct_fk')->references('acct_id')->on('fin_accounts')->nullOnDelete();
            $table->foreign('payslip_id', 'frvs_pay_fk')->references('payslip_id')->on('fin_payslip')->nullOnDelete();
            $table->foreign('refund_payslip_id', 'frvs_ref_pay_fk')->references('payslip_id')->on('fin_payslip')->nullOnDelete();
        });

        Schema::create('fin_rsu_vest_settlement_allocations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('settlement_id');
            $table->unsignedBigInteger('equity_award_id');
            $table->decimal('vested_shares', 18, 6);
            $table->decimal('gross_income', 18, 4);
            $table->decimal('allocation_ratio', 18, 10);
            $table->decimal('allocated_withheld_shares', 18, 6)->nullable();
            $table->decimal('allocated_withheld_value', 18, 4)->nullable();
            $table->decimal('allocated_tax_remitted', 18, 4)->nullable();
            $table->decimal('allocated_excess_refund', 18, 4)->nullable();
            $table->timestamps();

            $table->unique(['settlement_id', 'equity_award_id'], 'frvsa_set_award_unique');
            $table->foreign('settlement_id', 'frvsa_set_fk')->references('id')->on('fin_rsu_vest_settlements')->cascadeOnDelete();
            $table->foreign('equity_award_id', 'frvsa_award_fk')->references('id')->on('fin_equity_awards')->cascadeOnDelete();
        });

        Schema::create('fin_rsu_links', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('uid');
            $table->unsignedBigInteger('settlement_id')->nullable();
            $table->unsignedBigInteger('settlement_allocation_id')->nullable();
            $table->unsignedBigInteger('equity_award_id')->nullable();
            $table->string('link_type', 64);
            $table->unsignedBigInteger('transaction_id')->nullable();
            $table->unsignedBigInteger('account_id')->nullable();
            $table->unsignedBigInteger('lot_id')->nullable();
            $table->unsignedBigInteger('payslip_id')->nullable();
            $table->decimal('confidence', 5, 4)->nullable();
            $table->json('confidence_reasons')->nullable();
            $table->string('status', 32)->default('suggested');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['uid', 'link_type'], 'frl_uid_type_idx');
            $table->foreign('uid', 'frl_uid_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('settlement_id', 'frl_set_fk')->references('id')->on('fin_rsu_vest_settlements')->cascadeOnDelete();
            $table->foreign('settlement_allocation_id', 'frl_alloc_fk')->references('id')->on('fin_rsu_vest_settlement_allocations')->cascadeOnDelete();
            $table->foreign('equity_award_id', 'frl_award_fk')->references('id')->on('fin_equity_awards')->cascadeOnDelete();
            $table->foreign('transaction_id', 'frl_tx_fk')->references('t_id')->on('fin_account_line_items')->nullOnDelete();
            $table->foreign('account_id', 'frl_acct_fk')->references('acct_id')->on('fin_accounts')->nullOnDelete();
            $table->foreign('lot_id', 'frl_lot_fk')->references('lot_id')->on('fin_account_lots')->nullOnDelete();
            $table->foreign('payslip_id', 'frl_pay_fk')->references('payslip_id')->on('fin_payslip')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_rsu_links');
        Schema::dropIfExists('fin_rsu_vest_settlement_allocations');
        Schema::dropIfExists('fin_rsu_vest_settlements');

        Schema::table('fin_equity_awards', function (Blueprint $table): void {
            foreach (['vest_price_fetched_at', 'vest_price_source', 'grant_price_fetched_at', 'grant_price_source'] as $column) {
                if (Schema::hasColumn('fin_equity_awards', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function makeShareCountDecimal(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE fin_equity_awards MODIFY share_count DECIMAL(18,6) NOT NULL');
    }
};
