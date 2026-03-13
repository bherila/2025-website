<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinAccountTag extends Model
{
    protected $table = 'fin_account_tag';

    protected $primaryKey = 'tag_id';

    public $timestamps = false;

    /**
     * Valid tax_characteristic enum values (shared by migration, controller validation, and tests).
     * WARNING: If editing this list, you must create a schema migration to ensure the ENUM and CHECK
     * constraints are updated in the database (to add the new values).
     */
    public const TAX_CHARACTERISTIC_VALUES = [
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

    protected $fillable = [
        'tag_userid',
        'tag_label',
        'tag_color',
        'tax_characteristic',
        'when_deleted',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'tag_userid', 'id');
    }
}
