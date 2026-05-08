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
        // Add billing cadence fields to client_agreements
        Schema::table('client_agreements', function (Blueprint $table) {
            $table->string('billing_cadence', 20)->default('monthly')
                ->after('is_visible_to_client')
                ->comment('One of: monthly, quarterly, annual');
            $table->boolean('bill_overage_interim')->default(false)
                ->after('billing_cadence')
                ->comment('When true and cadence is not monthly, emit interim overage invoices at month boundaries');
            $table->string('first_cycle_proration', 30)->default('prorate_hours')
                ->after('bill_overage_interim')
                ->comment('One of: prorate_hours, full_period, align_next_cycle');
        });

        // Add invoice kind and cycle tracking to client_invoices
        Schema::table('client_invoices', function (Blueprint $table) {
            $table->string('invoice_kind', 30)->default('cadence_period')
                ->after('notes')
                ->comment('One of: cadence_period, interim_overage, terminal');
            $table->date('cycle_start')->nullable()
                ->after('invoice_kind')
                ->comment('First day of the cadence cycle this invoice belongs to');
            $table->date('cycle_end')->nullable()
                ->after('cycle_start')
                ->comment('Last day of the cadence cycle this invoice belongs to');

            $table->index(['client_company_id', 'cycle_start', 'cycle_end', 'invoice_kind'], 'client_invoices_cycle_index');
        });

        // Create recurring items table
        Schema::create('client_agreement_recurring_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_agreement_id')
                ->constrained('client_agreements')
                ->cascadeOnDelete();
            $table->string('description');
            $table->decimal('amount', 10, 2);
            $table->string('charge_cadence', 20)
                ->comment('One of: monthly, quarterly, semi_annual, annual, one_time');
            $table->tinyInteger('anchor_month')->nullable()
                ->comment('1-12. Anchors the incidence month for non-monthly cadences');
            $table->tinyInteger('anchor_day')->nullable()->default(1)
                ->comment('1-28 (clamped). Day of month for the incidence');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->boolean('is_taxable')->default(false);
            $table->boolean('is_summarized')->default(false)
                ->comment('When true, multiple incidences collapse into a summary line on display');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['client_agreement_id', 'start_date', 'end_date']);
        });

        // Add recurring item FK to client_invoice_lines
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            $table->foreignId('client_agreement_recurring_item_id')
                ->nullable()
                ->after('sort_order')
                ->constrained('client_agreement_recurring_items')
                ->nullOnDelete();
        });

        // Backfill existing invoices with invoice_kind = 'cadence_period'
        DB::table('client_invoices')
            ->whereNull('invoice_kind')
            ->orWhere('invoice_kind', '')
            ->update(['invoice_kind' => 'cadence_period']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('client_invoice_lines', function (Blueprint $table) {
            $table->dropForeign(['client_agreement_recurring_item_id']);
            $table->dropColumn('client_agreement_recurring_item_id');
        });

        Schema::dropIfExists('client_agreement_recurring_items');

        Schema::table('client_invoices', function (Blueprint $table) {
            $table->dropIndex('client_invoices_cycle_index');
            $table->dropColumn(['invoice_kind', 'cycle_start', 'cycle_end']);
        });

        Schema::table('client_agreements', function (Blueprint $table) {
            $table->dropColumn(['billing_cadence', 'bill_overage_interim', 'first_cycle_proration']);
        });
    }
};
