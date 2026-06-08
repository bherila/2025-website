<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fin_partnership_interests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('account_id')->nullable();
            $table->string('partnership_ein', 32)->nullable();
            $table->string('partnership_name');
            $table->string('normalized_partnership_name')->nullable();
            $table->string('form_type', 20)->default('k1_1065');
            $table->boolean('is_ptp')->default(false);
            $table->boolean('is_trader_fund')->default(false);
            $table->date('interest_start_date')->nullable();
            $table->date('interest_end_date')->nullable();
            $table->unsignedBigInteger('source_tax_document_id')->nullable();
            $table->unsignedBigInteger('source_tax_document_account_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'fp_interests_user_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('account_id', 'fp_interests_account_fk')->references('acct_id')->on('fin_accounts')->nullOnDelete();
            $table->foreign('source_tax_document_id', 'fp_interests_tax_doc_fk')->references('id')->on('fin_tax_documents')->nullOnDelete();
            $table->foreign('source_tax_document_account_id', 'fp_interests_doc_acct_fk')->references('id')->on('fin_document_accounts')->nullOnDelete();
            $table->unique(['user_id', 'account_id', 'partnership_ein'], 'fp_interests_user_account_ein_unique');
            $table->index(['user_id', 'account_id', 'normalized_partnership_name'], 'fp_interests_name_match_idx');
        });

        Schema::create('fin_partnership_basis_years', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('partnership_interest_id');
            $table->integer('tax_year');
            $table->bigInteger('beginning_outside_basis_cents')->default(0);
            $table->bigInteger('ending_outside_basis_cents')->default(0);
            $table->bigInteger('beginning_tax_basis_capital_cents')->default(0);
            $table->bigInteger('ending_tax_basis_capital_cents')->default(0);
            $table->bigInteger('beginning_book_capital_cents')->default(0);
            $table->bigInteger('ending_book_capital_cents')->default(0);
            $table->bigInteger('beginning_inside_basis_cents')->nullable();
            $table->bigInteger('ending_inside_basis_cents')->nullable();
            $table->string('inside_basis_confidence', 50)->default('unknown');
            $table->bigInteger('beginning_recourse_liability_cents')->default(0);
            $table->bigInteger('ending_recourse_liability_cents')->default(0);
            $table->bigInteger('beginning_nonrecourse_liability_cents')->default(0);
            $table->bigInteger('ending_nonrecourse_liability_cents')->default(0);
            $table->bigInteger('beginning_qualified_nonrecourse_liability_cents')->default(0);
            $table->bigInteger('ending_qualified_nonrecourse_liability_cents')->default(0);
            $table->bigInteger('capital_contributions_cents')->default(0);
            $table->bigInteger('taxable_income_increase_cents')->default(0);
            $table->bigInteger('tax_exempt_income_increase_cents')->default(0);
            $table->bigInteger('liability_increase_cents')->default(0);
            $table->bigInteger('cash_distributions_cents')->default(0);
            $table->bigInteger('property_distributions_basis_cents')->default(0);
            $table->bigInteger('liability_decrease_cents')->default(0);
            $table->bigInteger('deductions_losses_decrease_cents')->default(0);
            $table->bigInteger('nondeductible_expenses_decrease_cents')->default(0);
            $table->bigInteger('foreign_taxes_decrease_cents')->default(0);
            $table->bigInteger('distribution_gain_cents')->default(0);
            $table->bigInteger('suspended_loss_carryforward_cents')->default(0);
            $table->bigInteger('liquidation_gain_loss_cents')->nullable();
            $table->string('review_status', 30)->default('needs_review');
            $table->boolean('is_stale')->default(false);
            $table->string('source_hash', 64)->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'fp_basis_years_user_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('partnership_interest_id', 'fp_basis_years_interest_fk')->references('id')->on('fin_partnership_interests')->cascadeOnDelete();
            $table->unique(['user_id', 'partnership_interest_id', 'tax_year'], 'fp_basis_years_user_interest_year_unique');
            $table->index(['user_id', 'tax_year'], 'fp_basis_years_user_year_idx');
        });

        Schema::create('fin_partnership_basis_events', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('partnership_interest_id');
            $table->integer('tax_year');
            $table->date('event_date')->nullable();
            $table->integer('event_order')->default(0);
            $table->string('basis_side', 20)->default('outside');
            $table->string('event_type', 60);
            $table->bigInteger('amount_cents');
            $table->string('currency', 3)->default('USD');
            $table->string('source_type', 50)->default('manual');
            $table->unsignedBigInteger('tax_document_id')->nullable();
            $table->unsignedBigInteger('tax_document_account_id')->nullable();
            $table->unsignedBigInteger('account_id')->nullable();
            $table->unsignedBigInteger('line_item_id')->nullable();
            $table->unsignedBigInteger('statement_id')->nullable();
            $table->unsignedBigInteger('statement_investment_id')->nullable();
            $table->string('k1_box', 20)->nullable();
            $table->string('k1_code', 20)->nullable();
            $table->string('source_path')->nullable();
            $table->string('source_label')->nullable();
            $table->text('notes')->nullable();
            $table->string('review_status', 30)->default('needs_review');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('user_id', 'fp_basis_events_user_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('partnership_interest_id', 'fp_basis_events_interest_fk')->references('id')->on('fin_partnership_interests')->cascadeOnDelete();
            $table->foreign('tax_document_id', 'fp_basis_events_tax_doc_fk')->references('id')->on('fin_tax_documents')->nullOnDelete();
            $table->foreign('tax_document_account_id', 'fp_basis_events_doc_acct_fk')->references('id')->on('fin_document_accounts')->nullOnDelete();
            $table->foreign('account_id', 'fp_basis_events_account_fk')->references('acct_id')->on('fin_accounts')->nullOnDelete();
            $table->index(['user_id', 'partnership_interest_id', 'tax_year'], 'fp_basis_events_user_interest_year_idx');
            $table->index(['tax_document_id', 'tax_document_account_id'], 'fp_basis_events_tax_source_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fin_partnership_basis_events');
        Schema::dropIfExists('fin_partnership_basis_years');
        Schema::dropIfExists('fin_partnership_interests');
    }
};
