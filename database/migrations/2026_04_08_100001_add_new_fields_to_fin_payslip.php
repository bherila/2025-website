<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Step 1a — Add financially material fields to fin_payslip.
 *
 * • Fix ps_401k_employer precision from decimal(6,2) → decimal(12,4)
 * • RSU post-tax offsets: ps_rsu_tax_offset, ps_rsu_excess_refund
 * • Dividend equivalent earnings: earnings_dividend_equivalent
 * • Taxable wage bases: taxable_wages_oasdi, taxable_wages_medicare, taxable_wages_federal
 * • Imputed income: imp_life_choice
 * • PTO / absence balances: pto_accrued, pto_used, pto_available, pto_statutory_available
 * • Hours worked: hours_worked
 */
return new class extends Migration
{
    public function up(): void
    {
        // Fix ps_401k_employer precision on MySQL only (SQLite uses REAL, precision is irrelevant)
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE fin_payslip MODIFY COLUMN ps_401k_employer DECIMAL(12,4) NULL');
        }

        Schema::table('fin_payslip', function (Blueprint $table) {
            // RSU post-tax offsets (store as positive)
            $table->decimal('ps_rsu_tax_offset', 12, 4)->nullable()->after('ps_fed_tax_refunded');
            $table->decimal('ps_rsu_excess_refund', 12, 4)->nullable()->after('ps_rsu_tax_offset');

            // Dividend equivalent earnings
            $table->decimal('earnings_dividend_equivalent', 12, 4)->nullable()->after('earnings_rsu');

            // Taxable wage bases
            $table->decimal('taxable_wages_oasdi', 12, 4)->nullable()->after('ps_medicare');
            $table->decimal('taxable_wages_medicare', 12, 4)->nullable()->after('taxable_wages_oasdi');
            $table->decimal('taxable_wages_federal', 12, 4)->nullable()->after('taxable_wages_medicare');

            // Imputed income — Life@ Choice
            $table->decimal('imp_life_choice', 12, 4)->nullable()->after('imp_other');

            // PTO / absence balances
            $table->decimal('pto_accrued', 8, 2)->nullable()->after('ps_vacation_payout');
            $table->decimal('pto_used', 8, 2)->nullable()->after('pto_accrued');
            $table->decimal('pto_available', 8, 2)->nullable()->after('pto_used');
            $table->decimal('pto_statutory_available', 8, 2)->nullable()->after('pto_available');

            // Hours worked
            $table->decimal('hours_worked', 8, 2)->nullable()->after('pto_statutory_available');
        });
    }

    public function down(): void
    {
        Schema::table('fin_payslip', function (Blueprint $table) {
            $table->dropColumn([
                'ps_rsu_tax_offset',
                'ps_rsu_excess_refund',
                'earnings_dividend_equivalent',
                'taxable_wages_oasdi',
                'taxable_wages_medicare',
                'taxable_wages_federal',
                'imp_life_choice',
                'pto_accrued',
                'pto_used',
                'pto_available',
                'pto_statutory_available',
                'hours_worked',
            ]);
        });

        // Restore ps_401k_employer precision on MySQL
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE fin_payslip MODIFY COLUMN ps_401k_employer DECIMAL(6,2) NULL');
        }
    }
};
