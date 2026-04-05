<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Adds 'us_government_interest' to the fin_account_tag.tax_characteristic ENUM.
     * Values are hardcoded here intentionally — do NOT reference model constants
     * to preserve migration sequence integrity.
     *
     * SQLite: rebuilds the table with an updated CHECK constraint, since SQLite
     *         does not support ALTER TABLE ... MODIFY COLUMN.
     *
     *         Pattern: CREATE new → COPY data → DROP old (FKs off) → RENAME new.
     *         This preserves FK references in fin_account_line_item_tag_map because:
     *         - The old table is dropped with FK enforcement disabled.
     *         - The new table is renamed TO the original name, so dependent FK
     *           references (which still point to "fin_account_tag") remain valid.
     */
    private const ALL_VALUES = [
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
        'us_government_interest',
    ];

    private const PREVIOUS_VALUES = [
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
    ];

    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            $allValues = implode("','", self::ALL_VALUES);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$allValues}') NULL");

            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildSqliteTable(self::ALL_VALUES, false);
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::table('fin_account_tag')
                ->where('tax_characteristic', 'us_government_interest')
                ->update(['tax_characteristic' => null]);
            $previousValues = implode("','", self::PREVIOUS_VALUES);
            DB::statement("ALTER TABLE fin_account_tag MODIFY COLUMN tax_characteristic ENUM('{$previousValues}') NULL");

            return;
        }

        if ($driver === 'sqlite') {
            $this->rebuildSqliteTable(self::PREVIOUS_VALUES, true);
        }
    }

    /**
     * Rebuild fin_account_tag with an updated CHECK constraint.
     *
     * Pattern: CREATE new table → COPY data → DROP old (FK enforcement off) → RENAME.
     * Dependent tables (e.g. fin_account_line_item_tag_map) keep their FK references
     * pointing to "fin_account_tag" because we drop the old table and rename the new
     * one to that name, rather than renaming the old table to a backup name.
     *
     * @param  array<int, string>  $allowedValues  Values for the new CHECK constraint
     * @param  bool  $nullifyRemoved  When true, set tax_characteristic to NULL for
     *                                rows whose value is not in $allowedValues
     */
    private function rebuildSqliteTable(array $allowedValues, bool $nullifyRemoved): void
    {
        $inList = "'".implode("','", $allowedValues)."'";

        // 1. Create a replacement table with the updated CHECK constraint.
        DB::statement("CREATE TABLE `fin_account_tag_new`(
  `tag_id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tag_userid` TEXT NOT NULL,
  `tag_color` TEXT NOT NULL,
  `tag_label` TEXT NOT NULL,
  `when_added` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `when_deleted` TEXT,
  `tax_characteristic` varchar check(`tax_characteristic` IN ({$inList})),
  `employment_entity_id` INTEGER NULL REFERENCES fin_employment_entity(id) ON DELETE SET NULL,
  UNIQUE(`tag_userid`, `tag_label`)
)");

        // 2. Copy all rows; optionally NULL out any values not in the new allow-list.
        $taxCharExpr = $nullifyRemoved
            ? "CASE WHEN `tax_characteristic` IN ({$inList}) THEN `tax_characteristic` ELSE NULL END"
            : '`tax_characteristic`';

        DB::statement("INSERT INTO `fin_account_tag_new` (
  `tag_id`, `tag_userid`, `tag_color`, `tag_label`, `when_added`, `when_deleted`,
  `tax_characteristic`, `employment_entity_id`
) SELECT
  `tag_id`, `tag_userid`, `tag_color`, `tag_label`, `when_added`, `when_deleted`,
  {$taxCharExpr}, `employment_entity_id`
FROM `fin_account_tag`");

        // 3. Disable FK enforcement so we can drop the original table without
        //    violating the FK held by fin_account_line_item_tag_map.
        DB::statement('PRAGMA foreign_keys = OFF');

        try {
            DB::statement('DROP TABLE `fin_account_tag`');

            // 4. Rename the replacement to the original name.
            //    Because we are renaming *to* "fin_account_tag" (not away from it),
            //    dependent FK references in fin_account_line_item_tag_map remain valid.
            DB::statement('ALTER TABLE `fin_account_tag_new` RENAME TO `fin_account_tag`');
        } finally {
            DB::statement('PRAGMA foreign_keys = ON');
        }
    }
};
