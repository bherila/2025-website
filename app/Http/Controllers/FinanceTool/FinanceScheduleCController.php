<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class FinanceScheduleCController extends Controller
{
    /**
     * Returns Schedule C totals grouped by year and tax_characteristic.
     *
     * Optional query parameters:
     *   - year: Filter results to a specific year (e.g. "2024"). Omit for all years.
     *
     * Response shape:
     * {
     *   "available_years": ["2024", "2023"],
     *   "years": [
     *     {
     *       "year": "2024",
     *       "schedule_c_expense": {
     *         "sce_office_expenses": {
     *           "label": "Office expenses",
     *           "total": 200.00,
     *           "transactions": [{ "t_id": 1, "t_date": "2024-03-15", "t_description": "...", "t_amt": -200.00, "t_account": 5 }]
     *         }
     *       },
     *       ...
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
        $yearFilter = $request->query('year');

        // Get all tags with tax characteristics for this user (Schedule C + non-Schedule C)
        $tags = FinAccountTag::where('tag_userid', $uid)
            ->whereNull('when_deleted')
            ->whereNotNull('tax_characteristic')
            ->where('tax_characteristic', '!=', '')
            ->where('tax_characteristic', '!=', 'none')
            ->get(['tag_id', 'tax_characteristic', 'employment_entity_id']);

        if ($tags->isEmpty()) {
            return response()->json(['available_years' => [], 'years' => [], 'entities' => []]);
        }

        $tagIds = $tags->pluck('tag_id');
        $tagCharacteristicMap = $tags->pluck('tax_characteristic', 'tag_id');
        $tagEntityMap = $tags->pluck('employment_entity_id', 'tag_id');

        // Fetch employment entities for display names
        $entityIds = $tags->pluck('employment_entity_id')->filter()->unique()->values();
        $entities = [];
        if ($entityIds->isNotEmpty()) {
            $entities = DB::table('fin_employment_entity')
                ->whereIn('id', $entityIds->toArray())
                ->where('user_id', $uid)
                ->get(['id', 'display_name', 'type'])
                ->keyBy('id')
                ->toArray();
        }

        // Query individual transactions
        $query = DB::table('fin_account_line_items as li')
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
            ->select('li.t_id', 'li.t_date', 'li.t_description', 'li.t_amt', 'li.t_account', 't.tag_id')
            ->orderBy('li.t_date');

        // Fetch all rows first for available years, then filter
        $allRows = $query->get();
        $availableYears = $allRows
            ->map(fn ($row) => substr($row->t_date, 0, 4))
            ->unique()
            ->sortDesc()
            ->values()
            ->toArray();

        $rows = $yearFilter
            ? $allRows->filter(fn ($row) => substr($row->t_date, 0, 4) === (string) $yearFilter)
            : $allRows;

        // Build result grouped by year and entity
        // Key structure: byYear[year][entityId] = { schedule_c_income, schedule_c_expense, schedule_c_home_office }
        $byYear = [];
        foreach ($rows as $row) {
            $year = substr($row->t_date, 0, 4);
            $taxChar = $tagCharacteristicMap[$row->tag_id] ?? null;
            if (! $taxChar) {
                continue;
            }

            $entityId = $tagEntityMap[$row->tag_id] ?? null;

            if (! isset($byYear[$year])) {
                $byYear[$year] = [];
            }

            $entityKey = $entityId ?? 'unassigned';
            if (! isset($byYear[$year][$entityKey])) {
                $entityName = null;
                if ($entityId && isset($entities[$entityId])) {
                    $entityName = $entities[$entityId]->display_name;
                }
                $byYear[$year][$entityKey] = [
                    'entity_id' => $entityId,
                    'entity_name' => $entityName,
                    'schedule_c_income' => [],
                    'schedule_c_expense' => [],
                    'schedule_c_home_office' => [],
                ];
            }

            if (str_starts_with($taxChar, 'business_')) {
                $label = self::scheduleIncomeLabel($taxChar);
                $key = 'schedule_c_income';
                $amount = (float) $row->t_amt;
            } elseif (str_starts_with($taxChar, 'sce_')) {
                $label = self::scheduleExpenseLabel($taxChar);
                $key = 'schedule_c_expense';
                $amount = abs((float) $row->t_amt);
            } elseif (str_starts_with($taxChar, 'scho_')) {
                $label = self::homeOfficeLabel($taxChar);
                $key = 'schedule_c_home_office';
                $amount = abs((float) $row->t_amt);
            } else {
                // Non-Schedule C characteristics (interest, dividends, etc.) - skip for Schedule C view
                continue;
            }

            if (! isset($byYear[$year][$entityKey][$key][$taxChar])) {
                $byYear[$year][$entityKey][$key][$taxChar] = ['label' => $label, 'total' => 0.0, 'transactions' => []];
            }
            $byYear[$year][$entityKey][$key][$taxChar]['total'] += $amount;
            $byYear[$year][$entityKey][$key][$taxChar]['transactions'][] = [
                't_id' => $row->t_id,
                't_date' => substr($row->t_date, 0, 10),
                't_description' => $row->t_description,
                't_amt' => (float) $row->t_amt,
                't_account' => $row->t_account,
            ];
        }

        // Sort years descending
        krsort($byYear);

        // Format into response shape: years -> [ { year, entities: [ { entity_id, entity_name, schedule_c_* } ] } ]
        $result = [];
        foreach ($byYear as $year => $entitiesData) {
            $yearEntry = [
                'year' => $year,
                'entities' => array_values($entitiesData),
            ];
            $result[] = $yearEntry;
        }

        // Include entity info for the frontend
        $entityList = array_map(fn ($e) => ['id' => $e->id, 'display_name' => $e->display_name, 'type' => $e->type], array_values($entities));

        return response()->json([
            'available_years' => $availableYears,
            'years' => $result,
            'entities' => $entityList,
        ]);
    }

    public static function scheduleIncomeLabel(string $value): string
    {
        $labels = [
            'business_income' => 'Gross receipts or sales (Business Income)',
            'business_returns' => 'Returns and allowances',
        ];

        return $labels[$value] ?? $value;
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
