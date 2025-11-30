<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('AccountLineItemTag', function (Blueprint $table) {
            $table->id('tag_id');
            $table->string('tag_userid');
            $table->string('tag_color');
            $table->string('tag_label');
            $table->unique(['tag_userid', 'tag_label']);
        });

        Schema::create('earnings_annual', function (Blueprint $table) {
            $table->char('symbol', 5);
            $table->date('fiscalDateEnding');
            $table->decimal('reportedEPS', 10, 4)->nullable();
            $table->primary(['symbol', 'fiscalDateEnding']);
        });

        Schema::create('earnings_quarterly', function (Blueprint $table) {
            $table->char('symbol', 5);
            $table->date('fiscalDateEnding');
            $table->date('reportedDate')->nullable();
            $table->decimal('reportedEPS', 10, 4)->nullable();
            $table->decimal('estimatedEPS', 10, 4)->nullable();
            $table->decimal('surprise', 10, 4)->nullable();
            $table->decimal('surprisePercentage', 10, 4)->nullable();
            $table->primary(['symbol', 'fiscalDateEnding']);
        });

        Schema::create('fin_accounts', function (Blueprint $table) {
            $table->id('acct_id');
            $table->string('acct_owner', 50);
            $table->string('acct_name', 50);
            $table->timestamps();
            $table->softDeletes('when_deleted');
            $table->string('acct_last_balance', 20)->default('0');
            $table->timestamp('acct_last_balance_date')->nullable();
            $table->integer('acct_sort_order')->default(0);
            $table->boolean('acct_is_debt')->default(false);
            $table->boolean('acct_is_retirement')->default(false);
            $table->timestamp('when_closed')->nullable();
            $table->unique(['acct_owner', 'acct_name']);
        });

        Schema::create('fin_account_balance_snapshot', function (Blueprint $table) {
            $table->id('snapshot_id');
            $table->unsignedBigInteger('acct_id');
            $table->string('balance', 20);
            $table->timestamp('when_added')->useCurrent();
            $table->index('acct_id');
            $table->foreign('acct_id')->references('acct_id')->on('fin_accounts');
        });

        Schema::create('fin_account_tag', function (Blueprint $table) {
            $table->id('tag_id');
            $table->string('tag_userid', 50);
            $table->string('tag_color', 20);
            $table->string('tag_label', 50);
            $table->timestamp('when_added')->useCurrent();
            $table->softDeletes('when_deleted');
            $table->unique(['tag_userid', 'tag_label']);
        });

        Schema::create('fin_account_line_items', function (Blueprint $table) {
            $table->id('t_id');
            $table->unsignedBigInteger('t_account')->nullable();
            $table->string('t_date', 10);
            $table->string('t_type')->nullable();
            $table->string('t_schc_category')->nullable();
            $table->decimal('t_amt', 13, 4)->nullable();
            $table->string('t_symbol', 20)->nullable();
            $table->float('t_qty')->default(0);
            $table->decimal('t_price', 13, 4)->nullable();
            $table->decimal('t_commission', 13, 4)->nullable();
            $table->decimal('t_fee', 13, 4)->nullable();
            $table->string('t_method', 20)->nullable();
            $table->string('t_source', 20)->nullable();
            $table->string('t_origin', 20)->nullable();
            $table->string('opt_expiration', 10)->nullable();
            $table->enum('opt_type', ['call', 'put'])->nullable();
            $table->decimal('opt_strike', 13, 4)->nullable();
            $table->string('t_description', 255)->nullable();
            $table->string('t_comment', 255)->nullable();
            $table->string('t_from', 10)->nullable();
            $table->string('t_to', 10)->nullable();
            $table->string('t_interest_rate', 20)->nullable();
            $table->unsignedBigInteger('parent_t_id')->nullable();
            $table->string('t_cusip', 20)->nullable();
            $table->timestamp('when_added')->nullable();
            $table->softDeletes('when_deleted');
            $table->decimal('t_harvested_amount', 13, 4)->nullable();
            $table->string('t_date_posted', 10)->nullable();
            $table->index('t_account');
            $table->index('parent_t_id');
            $table->foreign('parent_t_id')->references('t_id')->on('fin_account_line_items')->onDelete('set null');
            $table->foreign('t_account')->references('acct_id')->on('fin_accounts');
        });

        Schema::create('fin_account_line_item_tag_map', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('t_id');
            $table->unsignedBigInteger('tag_id');
            $table->timestamp('when_added')->useCurrent();
            $table->softDeletes('when_deleted');
            $table->unique(['t_id', 'tag_id']);
            $table->index('tag_id');
            $table->foreign('t_id')->references('t_id')->on('fin_account_line_items')->onDelete('cascade');
            $table->foreign('tag_id')->references('tag_id')->on('fin_account_tag')->onDelete('cascade');
        });

        Schema::create('fin_equity_awards', function (Blueprint $table) {
            $table->id();
            $table->char('award_id', 20);
            $table->char('grant_date', 10);
            $table->char('vest_date', 10);
            $table->integer('share_count');
            $table->char('symbol', 4);
            $table->string('uid', 50);
            $table->decimal('vest_price', 10, 2)->nullable();
            $table->unique(['grant_date', 'award_id', 'vest_date', 'symbol']);
        });

        Schema::create('fin_payslip', function (Blueprint $table) {
            $table->id('payslip_id');
            $table->string('uid', 50)->nullable();
            $table->char('period_start', 10)->nullable();
            $table->char('period_end', 10)->nullable();
            $table->char('pay_date', 10)->nullable();
            $table->decimal('earnings_gross', 10, 4)->nullable();
            $table->decimal('earnings_bonus', 10, 4)->nullable();
            $table->decimal('earnings_net_pay', 10, 4)->default(0.0000);
            $table->decimal('earnings_rsu', 10, 4)->nullable();
            $table->decimal('imp_other', 10, 4)->nullable();
            $table->decimal('imp_legal', 10, 4)->default(0.0000);
            $table->decimal('imp_fitness', 10, 4)->default(0.0000);
            $table->decimal('imp_ltd', 10, 4)->default(0.0000);
            $table->decimal('ps_oasdi', 10, 4)->nullable();
            $table->decimal('ps_medicare', 10, 4)->nullable();
            $table->decimal('ps_fed_tax', 10, 4)->nullable();
            $table->decimal('ps_fed_tax_addl', 10, 4)->nullable();
            $table->decimal('ps_state_tax', 10, 4)->nullable();
            $table->decimal('ps_state_tax_addl', 10, 4)->nullable();
            $table->decimal('ps_state_disability', 10, 4)->nullable();
            $table->decimal('ps_401k_pretax', 10, 4)->nullable();
            $table->decimal('ps_401k_aftertax', 10, 4)->nullable();
            $table->decimal('ps_401k_employer', 6, 2)->nullable();
            $table->decimal('ps_fed_tax_refunded', 10, 4)->nullable();
            $table->string('ps_payslip_file_hash', 50)->nullable();
            $table->boolean('ps_is_estimated')->default(true);
            $table->string('ps_comment', 1000)->nullable();
            $table->decimal('ps_pretax_medical', 10, 4)->default(0.0000);
            $table->decimal('ps_pretax_fsa', 10, 4)->default(0.0000);
            $table->decimal('ps_salary', 10, 4)->default(0.0000);
            $table->decimal('ps_vacation_payout', 10, 4)->default(0.0000);
            $table->decimal('ps_pretax_dental', 10, 4)->default(0.0000);
            $table->decimal('ps_pretax_vision', 10, 4)->default(0.0000);
            $table->mediumText('other')->nullable();
            $table->unique(['uid', 'period_start', 'period_end', 'pay_date']);
        });

        Schema::create('fin_payslip_uploads', function (Blueprint $table) {
            $table->id();
            $table->string('file_name', 200)->nullable();
            $table->string('file_hash', 50)->nullable();
            $table->longText('parsed_json')->nullable();
        });

        Schema::create('graduated_tax', function (Blueprint $table) {
            $table->integer('year');
            $table->char('region', 2);
            $table->integer('income_over');
            $table->enum('type', ['s', 'mfj', 'mfs', 'hoh'])->default('s');
            $table->decimal('rate', 10, 4);
            $table->boolean('verified')->default(false);
            $table->unique(['year', 'region', 'income_over', 'type']);
        });

        Schema::create('phr_lab_results', function (Blueprint $table) {
            $table->id();
            $table->string('user_id')->nullable();
            $table->string('test_name', 255)->nullable();
            $table->timestamp('collection_datetime')->nullable();
            $table->timestamp('result_datetime')->nullable();
            $table->string('result_status', 50)->nullable();
            $table->string('ordering_provider', 100)->nullable();
            $table->string('resulting_lab', 100)->nullable();
            $table->string('analyte', 100)->nullable();
            $table->string('value', 20)->nullable();
            $table->string('unit', 20)->nullable();
            $table->decimal('range_min', 10, 2)->nullable();
            $table->decimal('range_max', 10, 2)->nullable();
            $table->string('range_unit', 20)->nullable();
            $table->string('normal_value', 50)->nullable();
            $table->mediumText('message_from_provider')->nullable();
            $table->mediumText('result_comment')->nullable();
            $table->string('lab_director', 100)->nullable();
        });

        Schema::create('phr_patient_vitals', function (Blueprint $table) {
            $table->id();
            $table->string('user_id', 50)->nullable();
            $table->string('vital_name', 255)->nullable();
            $table->date('vital_date')->nullable();
            $table->string('vital_value', 255)->nullable();
        });

        Schema::create('product_keys', function (Blueprint $table) {
            $table->id();
            $table->string('uid')->nullable();
            $table->string('product_id', 100)->nullable();
            $table->string('product_key', 2000)->nullable();
            $table->string('product_name', 100)->nullable();
            $table->string('computer_name', 100)->nullable();
            $table->string('comment', 2000)->nullable();
            $table->char('used_on', 10)->nullable();
            $table->string('claimed_date', 100)->nullable();
            $table->string('key_type', 100)->nullable();
            $table->mediumText('key_retrieval_note')->nullable();
            $table->unique('product_key');
        });

        Schema::create('stock_quotes_daily', function (Blueprint $table) {
            $table->date('c_date');
            $table->char('c_symb', 5);
            $table->decimal('c_open', 10, 4);
            $table->decimal('c_high', 10, 4);
            $table->decimal('c_low', 10, 4);
            $table->decimal('c_close', 10, 4);
            $table->bigInteger('c_vol');
            $table->unique(['c_symb', 'c_date']);
            $table->index('c_symb');
        });

        Schema::create('timeseries_documents', function (Blueprint $table) {
            $table->id();
            $table->integer('uid');
            $table->string('name', 50);
        });

        Schema::create('timeseries_series', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->string('series_name', 50);
            $table->index('document_id');
            $table->foreign('document_id')->references('id')->on('timeseries_documents');
        });

        Schema::create('timeseries_datapoint', function (Blueprint $table) {
            $table->id('dp_id');
            $table->unsignedBigInteger('dp_series_id');
            $table->date('dp_date')->nullable();
            $table->string('dp_value', 20)->nullable();
            $table->mediumText('dp_comment')->nullable();
            $table->index('dp_series_id');
            $table->foreign('dp_series_id')->references('id')->on('timeseries_series');
        });

        Schema::create('vxcv_files', function (Blueprint $table) {
            $table->binary('hash', 20);
            $table->string('filename', 150);
            $table->string('mime', 30);
            $table->integer('downloads')->default(0);
            $table->integer('max_downloads')->default(7);
            $table->integer('size');
            $table->timestamp('uploaded');
            $table->tinyInteger('blocked')->default(0);
            $table->integer('ip');
            $table->primary('hash');
        });

        Schema::create('vxcv_links', function (Blueprint $table) {
            $table->char('uniqueid', 5);
            $table->string('url', 15000);
            $table->primary('uniqueid');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vxcv_links');
        Schema::dropIfExists('vxcv_files');
        Schema::dropIfExists('users_legacy');
        Schema::dropIfExists('timeseries_datapoint');
        Schema::dropIfExists('timeseries_series');
        Schema::dropIfExists('timeseries_documents');
        Schema::dropIfExists('stock_quotes_daily');
        Schema::dropIfExists('product_keys');
        Schema::dropIfExists('phr_patient_vitals');
        Schema::dropIfExists('phr_lab_results');
        Schema::dropIfExists('graduated_tax');
        Schema::dropIfExists('fin_payslip_uploads');
        Schema::dropIfExists('fin_payslip');
        Schema::dropIfExists('fin_equity_awards');
        Schema::dropIfExists('fin_account_line_item_tag_map');
        Schema::dropIfExists('fin_account_line_items');
        Schema::dropIfExists('fin_account_tag');
        Schema::dropIfExists('fin_account_balance_snapshot');
        Schema::dropIfExists('fin_accounts');
        Schema::dropIfExists('earnings_quarterly');
        Schema::dropIfExists('earnings_annual');
        Schema::dropIfExists('AccountLineItemTag');
    }
};
