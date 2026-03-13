<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceScheduleCController extends Controller
{
    /**
     * Returns Schedule C totals grouped by year and tax_characteristic.
     *
     * Response shape:
     * {
     *   "years": [
     *     {
     *       "year": "2024",
     *       "schedule_c_expense": { "Advertising": 123.45, ... },
     *       "schedule_c_home_office": { "Rent": 100.00, ... }
     *     },
     *     ...
     *   ]
     * }
     *
     * Amounts are returned as positive numbers (expenses are negated).
     */
    public function getSummary(Request $request)
    {
        $uid = Auth::id();

        // Get all Schedule C tags for this user
        $tags = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->whereNotNull('tax_characteristic')
            ->where('tax_characteristic', '!=', '')
            ->where('tax_characteristic', '!=', 'none')
            ->get(['tag_id', 'tax_characteristic']);

        if ($tags->isEmpty()) {
            return response()->json(['years' => []]);
        }

        $tagIds = $tags->pluck('tag_id');
        $tagCharacteristicMap = $tags->pluck('tax_characteristic', 'tag_id');

        // Query: join tag map with line items, group by year and tag_id
        $rows = DB::table('fin_account_line_items as li')
            ->join('fin_account_line_item_tag_map as tm', function ($join) {
                $join->on('li.t_id', '=', 'tm.t_id')
                     ->whereNull('tm.when_deleted');
            })
            ->join('fin_account_tag as t', function ($join) use ($tagIds) {
                $join->on('tm.tag_id', '=', 't.tag_id')
                     ->whereIn('t.tag_id', $tagIds->toArray());
            })
            ->join('fin_accounts as a', 'li.t_account', '=', 'a.acct_id')
            ->where('a.acct_owner', $uid)
            ->selectRaw('SUBSTR(li.t_date, 1, 4) as year, t.tag_id, SUM(li.t_amt) as total')
            ->groupBy('year', 't.tag_id')
            ->orderBy('year')
            ->get();

        // Build result grouped by year
        $byYear = [];
        foreach ($rows as $row) {
            $year = $row->year;
            $taxChar = $tagCharacteristicMap[$row->tag_id] ?? null;
            if (!$taxChar) {
                continue;
            }

            if (!isset($byYear[$year])) {
                $byYear[$year] = [
                    'year' => $year,
                    'schedule_c_expense' => [],
                    'schedule_c_home_office' => [],
                ];
            }

            // Amounts are typically negative (expenses); display as positive
            $amount = abs((float) $row->total);

            if (str_starts_with($taxChar, 'sce_')) {
                $label = self::scheduleExpenseLabel($taxChar);
                $key = 'schedule_c_expense';
            } elseif (str_starts_with($taxChar, 'scho_')) {
                $label = self::homeOfficeLabel($taxChar);
                $key = 'schedule_c_home_office';
            } else {
                continue;
            }

            if (!isset($byYear[$year][$key][$taxChar])) {
                $byYear[$year][$key][$taxChar] = ['label' => $label, 'total' => 0.0];
            }
            $byYear[$year][$key][$taxChar]['total'] += $amount;
        }

        // Sort years descending (most recent first)
        krsort($byYear);

        return response()->json(['years' => array_values($byYear)]);
    }

    public static function scheduleExpenseLabel(string $value): string
    {
        $labels = [
            'sce_advertising' => 'Advertising',
            'sce_car_truck' => 'Car and truck expenses',
            'sce_commissions_fees' => 'Commissions and fees',
            'sce_contract_labor' => 'Contract labor',
            'sce_depletion' => 'Depletion',
            'sce_depreciation' => 'Depreciation and Section 179 expense',
            'sce_employee_benefits' => 'Employee benefit programs',
            'sce_insurance' => 'Insurance (other than health)',
            'sce_interest_mortgage' => 'Interest (mortgage)',
            'sce_interest_other' => 'Interest (other)',
            'sce_legal_professional' => 'Legal and professional services',
            'sce_office_expenses' => 'Office expenses',
            'sce_pension' => 'Pension and profit-sharing plans',
            'sce_rent_vehicles' => 'Rent or lease (vehicles, machinery, equipment)',
            'sce_rent_property' => 'Rent or lease (other business property)',
            'sce_repairs_maintenance' => 'Repairs and maintenance',
            'sce_supplies' => 'Supplies',
            'sce_taxes_licenses' => 'Taxes and licenses',
            'sce_travel' => 'Travel',
            'sce_meals' => 'Meals',
            'sce_utilities' => 'Utilities',
            'sce_wages' => 'Wages',
            'sce_other' => 'Other expenses',
        ];

        return $labels[$value] ?? $value;
    }

    public static function homeOfficeLabel(string $value): string
    {
        $labels = [
            'scho_rent' => 'Rent',
            'scho_mortgage_interest' => 'Mortgage interest (business-use portion)',
            'scho_real_estate_taxes' => 'Real estate taxes',
            'scho_insurance' => 'Homeowners or renters insurance',
            'scho_utilities' => 'Utilities',
            'scho_repairs_maintenance' => 'Repairs and maintenance',
            'scho_security' => 'Security system costs',
            'scho_depreciation' => 'Depreciation',
            'scho_cleaning' => 'Cleaning services',
            'scho_hoa' => 'HOA fees',
            'scho_casualty_losses' => 'Casualty losses (business-use portion)',
        ];

        return $labels[$value] ?? $value;
    }
}
