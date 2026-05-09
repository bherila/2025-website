<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CLIENT_INVOICES_CYCLE_INDEX = 'client_invoices_cycle_index';

    private const RECURRING_ITEMS_DATES_INDEX = 'car_items_agreement_dates_idx';

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Add billing cadence fields to client_agreements
        if (! Schema::hasColumn('client_agreements', 'billing_cadence')) {
            Schema::table('client_agreements', function (Blueprint $table) {
                $table->string('billing_cadence', 20)->default('monthly')
                    ->after('is_visible_to_client')
                    ->comment('One of: monthly, quarterly, annual');
            });
        }

        if (! Schema::hasColumn('client_agreements', 'bill_overage_interim')) {
            Schema::table('client_agreements', function (Blueprint $table) {
                $table->boolean('bill_overage_interim')->default(false)
                    ->after('billing_cadence')
                    ->comment('When true and cadence is not monthly, emit interim overage invoices at month boundaries');
            });
        }

        if (! Schema::hasColumn('client_agreements', 'first_cycle_proration')) {
            Schema::table('client_agreements', function (Blueprint $table) {
                $table->string('first_cycle_proration', 30)->default('prorate_hours')
                    ->after('bill_overage_interim')
                    ->comment('One of: prorate_hours, full_period, align_next_cycle');
            });
        }

        // Add invoice kind and cycle tracking to client_invoices
        if (! Schema::hasColumn('client_invoices', 'invoice_kind')) {
            Schema::table('client_invoices', function (Blueprint $table) {
                $table->string('invoice_kind', 30)->default('cadence_period')
                    ->after('notes')
                    ->comment('One of: cadence_period, interim_overage, terminal');
            });
        }

        if (! Schema::hasColumn('client_invoices', 'cycle_start')) {
            Schema::table('client_invoices', function (Blueprint $table) {
                $table->date('cycle_start')->nullable()
                    ->after('invoice_kind')
                    ->comment('First day of the cadence cycle this invoice belongs to');
            });
        }

        if (! Schema::hasColumn('client_invoices', 'cycle_end')) {
            Schema::table('client_invoices', function (Blueprint $table) {
                $table->date('cycle_end')->nullable()
                    ->after('cycle_start')
                    ->comment('Last day of the cadence cycle this invoice belongs to');
            });
        }

        if (
            ! Schema::hasIndex('client_invoices', self::CLIENT_INVOICES_CYCLE_INDEX)
            && ! Schema::hasIndex('client_invoices', ['client_company_id', 'cycle_start', 'cycle_end', 'invoice_kind'])
        ) {
            Schema::table('client_invoices', function (Blueprint $table) {
                $table->index(['client_company_id', 'cycle_start', 'cycle_end', 'invoice_kind'], self::CLIENT_INVOICES_CYCLE_INDEX);
            });
        }

        // Create recurring items table
        if (! Schema::hasTable('client_agreement_recurring_items')) {
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
            });
        }

        if (
            ! Schema::hasIndex('client_agreement_recurring_items', self::RECURRING_ITEMS_DATES_INDEX)
            && ! Schema::hasIndex('client_agreement_recurring_items', ['client_agreement_id', 'start_date', 'end_date'])
        ) {
            Schema::table('client_agreement_recurring_items', function (Blueprint $table) {
                $table->index(['client_agreement_id', 'start_date', 'end_date'], self::RECURRING_ITEMS_DATES_INDEX);
            });
        }

        // Add recurring item FK to client_invoice_lines
        if (! Schema::hasColumn('client_invoice_lines', 'client_agreement_recurring_item_id')) {
            Schema::table('client_invoice_lines', function (Blueprint $table) {
                $table->foreignId('client_agreement_recurring_item_id')
                    ->nullable()
                    ->after('sort_order');
            });
        }

        if (! $this->hasForeignKey('client_invoice_lines', ['client_agreement_recurring_item_id'])) {
            Schema::table('client_invoice_lines', function (Blueprint $table) {
                $table->foreign('client_agreement_recurring_item_id')
                    ->references('id')
                    ->on('client_agreement_recurring_items')
                    ->nullOnDelete();
            });
        }

        // Backfill existing invoices with cadence-period metadata.
        DB::table('client_invoices')
            ->whereNull('invoice_kind')
            ->orWhere('invoice_kind', '')
            ->update(['invoice_kind' => 'cadence_period']);

        DB::table('client_invoices')
            ->whereNull('cycle_start')
            ->whereNotNull('period_start')
            ->update([
                'cycle_start' => DB::raw('period_start'),
            ]);

        DB::table('client_invoices')
            ->whereNull('cycle_end')
            ->whereNotNull('period_end')
            ->update([
                'cycle_end' => DB::raw('period_end'),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('client_invoice_lines', 'client_agreement_recurring_item_id')) {
            $hasRecurringItemForeignKey = $this->hasForeignKey('client_invoice_lines', ['client_agreement_recurring_item_id']);

            Schema::table('client_invoice_lines', function (Blueprint $table) use ($hasRecurringItemForeignKey) {
                if ($hasRecurringItemForeignKey) {
                    $table->dropForeign(['client_agreement_recurring_item_id']);
                }

                $table->dropColumn('client_agreement_recurring_item_id');
            });
        }

        Schema::dropIfExists('client_agreement_recurring_items');

        if (Schema::hasTable('client_invoices')) {
            if (Schema::hasIndex('client_invoices', self::CLIENT_INVOICES_CYCLE_INDEX)) {
                Schema::table('client_invoices', function (Blueprint $table) {
                    $table->dropIndex(self::CLIENT_INVOICES_CYCLE_INDEX);
                });
            }

            $clientInvoiceColumns = $this->existingColumns('client_invoices', ['invoice_kind', 'cycle_start', 'cycle_end']);

            if ($clientInvoiceColumns !== []) {
                Schema::table('client_invoices', function (Blueprint $table) use ($clientInvoiceColumns) {
                    $table->dropColumn($clientInvoiceColumns);
                });
            }
        }

        if (Schema::hasTable('client_agreements')) {
            $clientAgreementColumns = $this->existingColumns('client_agreements', ['billing_cadence', 'bill_overage_interim', 'first_cycle_proration']);

            if ($clientAgreementColumns !== []) {
                Schema::table('client_agreements', function (Blueprint $table) use ($clientAgreementColumns) {
                    $table->dropColumn($clientAgreementColumns);
                });
            }
        }
    }

    /**
     * @param  list<string>  $columns
     */
    private function hasForeignKey(string $table, array $columns): bool
    {
        $columns = array_map('strtolower', $columns);

        foreach (Schema::getForeignKeys($table) as $foreignKey) {
            $foreignKeyColumns = array_map('strtolower', $foreignKey['columns'] ?? []);

            if ($foreignKeyColumns === $columns) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $columns
     * @return list<string>
     */
    private function existingColumns(string $table, array $columns): array
    {
        return array_values(array_filter(
            $columns,
            fn (string $column): bool => Schema::hasColumn($table, $column),
        ));
    }
};
