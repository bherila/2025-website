<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adds business_income and business_returns to the tax_characteristic ENUM.
     * Values are hardcoded here intentionally — do NOT reference model constants
     * to preserve migration sequence integrity.
     */
    public function up(): void
    {
        // For MySQL: modify the ENUM to add new values
        // For SQLite (used in tests): no-op since we use TEXT + CHECK and we need to update the check
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            // All 36 values (original 34 + 2 new)
            $allValues = implode("','", [
                'business_income', 'business_returns',
                'sce_advertising', 'sce_car_truck', 'sce_commissions_fees', 'sce_contract_labor',
                'sce_depletion', 'sce_depreciation', 'sce_employee_benefits', 'sce_insurance',
                'sce_interest_mortgage', 'sce_interest_other', 'sce_legal_professional',
                'sce_office_expenses', 'sce_pension', 'sce_rent_vehicles', 'sce_rent_property',
                'sce_repairs_maintenance', 'sce_supplies', 'sce_taxes_licenses', 'sce_travel',
                'sce_meals', 'sce_utilities', 'sce_wages', 'sce_other',
                'scho_rent', 'scho_mortgage_interest', 'scho_real_estate_taxes', 'scho_insurance',
                'scho_utilities', 'scho_repairs_maintenance', 'scho_security', 'scho_depreciation',
                'scho_cleaning', 'scho_hoa', 'scho_casualty_losses',
            ]);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$allValues}') NULL");
        }
        // SQLite: the TEXT + CHECK constraint already allows any string value; no change needed
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            // Revert to original 34 values
            $originalValues = implode("','", [
                'sce_advertising', 'sce_car_truck', 'sce_commissions_fees', 'sce_contract_labor',
                'sce_depletion', 'sce_depreciation', 'sce_employee_benefits', 'sce_insurance',
                'sce_interest_mortgage', 'sce_interest_other', 'sce_legal_professional',
                'sce_office_expenses', 'sce_pension', 'sce_rent_vehicles', 'sce_rent_property',
                'sce_repairs_maintenance', 'sce_supplies', 'sce_taxes_licenses', 'sce_travel',
                'sce_meals', 'sce_utilities', 'sce_wages', 'sce_other',
                'scho_rent', 'scho_mortgage_interest', 'scho_real_estate_taxes', 'scho_insurance',
                'scho_utilities', 'scho_repairs_maintenance', 'scho_security', 'scho_depreciation',
                'scho_cleaning', 'scho_hoa', 'scho_casualty_losses',
            ]);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$originalValues}') NULL");
        }
    }
};
