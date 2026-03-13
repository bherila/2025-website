<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Valid tax_characteristic values.
     *
     * These are intentionally hardcoded here — do NOT reference
     * FinAccountTag::TAX_CHARACTERISTIC_VALUES or any other model constant.
     * Migration files must be immutable: if the application-level constant
     * changes in the future, this migration sequence must still produce the
     * same schema snapshot that it produced when first run.
     *
     * sce_* = Schedule C Expense categories
     * scho_* = Schedule C Home Office categories
     */
    private const VALUES = [
        // Schedule C: Expense
        'sce_advertising',
        'sce_car_truck',
        'sce_commissions_fees',
        'sce_contract_labor',
        'sce_depletion',
        'sce_depreciation',
        'sce_employee_benefits',
        'sce_insurance',
        'sce_interest_mortgage',
        'sce_interest_other',
        'sce_legal_professional',
        'sce_office_expenses',
        'sce_pension',
        'sce_rent_vehicles',
        'sce_rent_property',
        'sce_repairs_maintenance',
        'sce_supplies',
        'sce_taxes_licenses',
        'sce_travel',
        'sce_meals',
        'sce_utilities',
        'sce_wages',
        'sce_other',
        // Schedule C: Home Office
        'scho_rent',
        'scho_mortgage_interest',
        'scho_real_estate_taxes',
        'scho_insurance',
        'scho_utilities',
        'scho_repairs_maintenance',
        'scho_security',
        'scho_depreciation',
        'scho_cleaning',
        'scho_hoa',
        'scho_casualty_losses',
    ];

    /**
     * Run the migrations.
     *
     * On MySQL: adds an ENUM column to enforce valid values at the DB level.
     * On SQLite: adds a TEXT column with a CHECK constraint (SQLite does not support ENUM).
     */
    public function up(): void
    {
        Schema::table('fin_account_tag', function (Blueprint $table) {
            $table->enum('tax_characteristic', self::VALUES)->nullable()->after('tag_label');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fin_account_tag', function (Blueprint $table) {
            $table->dropColumn('tax_characteristic');
        });
    }
};
