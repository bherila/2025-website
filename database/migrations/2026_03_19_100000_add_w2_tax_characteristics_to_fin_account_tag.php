<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adds w2_wages, w2_other_comp to the tax_characteristic ENUM.
     * Values are hardcoded here intentionally — do NOT reference model constants
     * to preserve migration sequence integrity.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            // All values (previous 40 + 2 new W-2 items)
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
                'interest', 'ordinary_dividend', 'qualified_dividend', 'other_ordinary_income',
                'w2_wages', 'w2_other_comp',
            ]);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$allValues}') NULL");
        }
        // SQLite: TEXT + CHECK allows any string in tests; no change needed
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            // Revert to previous 40 values
            $previousValues = implode("','", [
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
                'interest', 'ordinary_dividend', 'qualified_dividend', 'other_ordinary_income',
            ]);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$previousValues}') NULL");
        }
    }
};
