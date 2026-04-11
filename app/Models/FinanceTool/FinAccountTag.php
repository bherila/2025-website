<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinAccountTag extends Model
{
    protected $table = 'fin_account_tag';

    protected $primaryKey = 'tag_id';

    public $timestamps = false;

    /**
     * Unified tax characteristic registry.
     *
     * Each entry maps a characteristic code to its metadata:
     *   - label:        Human-readable display name
     *   - category:     Grouping key ('sch_c_income', 'sch_c_expense', 'sch_c_home_office', 'other')
     *   - entity_types: Which employment-entity types this characteristic applies to (empty = no entity required)
     *
     * SYNC WARNING: This registry MUST be kept in sync with TAX_CHARACTERISTICS
     * in resources/js/lib/finance/taxCharacteristics.ts. When adding or removing entries here,
     * make the same change in the TypeScript file.
     *
     * WARNING: If adding new entries, you must also create a schema migration
     * to update the ENUM / CHECK constraint in the database.
     * Migration files must hardcode values — never reference this constant.
     */
    public const TAX_CHARACTERISTICS = [
        // Schedule C: Income
        'business_income' => ['label' => 'Gross receipts or sales (Business Income)', 'category' => 'sch_c_income', 'entity_types' => ['sch_c']],
        'business_returns' => ['label' => 'Returns and allowances', 'category' => 'sch_c_income', 'entity_types' => ['sch_c']],
        // Schedule C: Expense
        'sce_advertising' => ['label' => 'Advertising', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_car_truck' => ['label' => 'Car and truck expenses', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_commissions_fees' => ['label' => 'Commissions and fees', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_contract_labor' => ['label' => 'Contract labor', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_depletion' => ['label' => 'Depletion', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_depreciation' => ['label' => 'Depreciation and Section 179 expense', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_employee_benefits' => ['label' => 'Employee benefit programs', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_insurance' => ['label' => 'Insurance (other than health)', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_interest_mortgage' => ['label' => 'Interest (mortgage)', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_interest_other' => ['label' => 'Interest (other)', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_legal_professional' => ['label' => 'Legal and professional services', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_office_expenses' => ['label' => 'Office expenses', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_pension' => ['label' => 'Pension and profit-sharing plans', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_rent_vehicles' => ['label' => 'Rent or lease (vehicles, machinery, equipment)', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_rent_property' => ['label' => 'Rent or lease (other business property)', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_repairs_maintenance' => ['label' => 'Repairs and maintenance', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_supplies' => ['label' => 'Supplies', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_taxes_licenses' => ['label' => 'Taxes and licenses', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_travel' => ['label' => 'Travel', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_meals' => ['label' => 'Meals', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_utilities' => ['label' => 'Utilities', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_wages' => ['label' => 'Wages', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        'sce_other' => ['label' => 'Other expenses', 'category' => 'sch_c_expense', 'entity_types' => ['sch_c']],
        // Schedule C: Home Office
        'scho_rent' => ['label' => 'Rent', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_mortgage_interest' => ['label' => 'Mortgage interest (business-use portion)', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_real_estate_taxes' => ['label' => 'Real estate taxes', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_insurance' => ['label' => 'Homeowners or renters insurance', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_utilities' => ['label' => 'Utilities', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_repairs_maintenance' => ['label' => 'Repairs and maintenance', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_security' => ['label' => 'Security system costs', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_depreciation' => ['label' => 'Depreciation', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_cleaning' => ['label' => 'Cleaning services', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_hoa' => ['label' => 'HOA fees', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        'scho_casualty_losses' => ['label' => 'Casualty losses (business-use portion)', 'category' => 'sch_c_home_office', 'entity_types' => ['sch_c']],
        // Non-Schedule C (no employment entity required)
        'interest' => ['label' => 'Interest', 'category' => 'other', 'entity_types' => []],
        'ordinary_dividend' => ['label' => 'Ordinary Dividend', 'category' => 'other', 'entity_types' => []],
        'qualified_dividend' => ['label' => 'Qualified Dividend', 'category' => 'other', 'entity_types' => []],
        'other_ordinary_income' => ['label' => 'Other Ordinary Income', 'category' => 'other', 'entity_types' => []],
        // W-2 income items
        'w2_wages' => ['label' => 'W-2 Wages / Salary', 'category' => 'w2_income', 'entity_types' => ['w2']],
        'w2_other_comp' => ['label' => 'W-2 Other Compensation', 'category' => 'w2_income', 'entity_types' => ['w2']],
    ];

    /** All valid tax_characteristic enum values (flat list). */
    public static function validValues(): array
    {
        return array_keys(self::TAX_CHARACTERISTICS);
    }

    /** Tax characteristic codes that require a Schedule C employment entity. */
    public static function scheduleCValues(): array
    {
        return array_keys(array_filter(
            self::TAX_CHARACTERISTICS,
            fn (array $meta) => in_array('sch_c', $meta['entity_types']),
        ));
    }

    /** Get the human-readable label for a tax characteristic code. */
    public static function labelFor(string $code): string
    {
        return self::TAX_CHARACTERISTICS[$code]['label'] ?? $code;
    }

    /**
     * Check if a tax characteristic requires a Schedule C employment entity.
     */
    public static function isScheduleCCharacteristic(?string $value): bool
    {
        if (! $value) {
            return false;
        }

        $meta = self::TAX_CHARACTERISTICS[$value] ?? null;

        return $meta && in_array('sch_c', $meta['entity_types']);
    }

    protected $fillable = [
        'tag_userid',
        'tag_label',
        'tag_color',
        'tax_characteristic',
        'employment_entity_id',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'tag_userid', 'id');
    }

    public function employmentEntity()
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }
}
