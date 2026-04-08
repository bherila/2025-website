<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinPayslips;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class FinancePayslipController extends Controller
{
    public function index(): View
    {
        return view('payslip');
    }

    public function entry(): View
    {
        return view('payslip-entry');
    }

    public function fetchPayslipYears(): JsonResponse
    {
        try {
            $uid = Auth::id();

            $years = FinPayslips::where('uid', $uid)
                ->where('pay_date', 'like', '20%')
                ->selectRaw('DISTINCT SUBSTRING(pay_date, 1, 4) as year')
                ->orderBy('year', 'asc')
                ->get()
                ->pluck('year')
                ->toArray();

            // Add current year if not present
            $currentYear = (string) date('Y');
            if (! in_array($currentYear, $years)) {
                $years[] = $currentYear;
            }

            rsort($years); // Sort in descending order

            return response()->json($years);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch payslip years: '.$e->getMessage()], 500);
        }
    }

    public function fetchPayslips(Request $request): JsonResponse
    {
        $uid = Auth::id();
        $year = $request->query('year', date('Y'));

        if ($year < '1900' || $year > '2100') {
            return response()->json(['error' => 'Invalid year'], 400);
        }

        $start = "{$year}-01-01";
        $end = "{$year}-12-31";

        $data = FinPayslips::where('uid', $uid)
            ->whereBetween('pay_date', [$start, $end])
            ->orderBy('pay_date', 'asc')
            ->get();

        // Decode 'other' field
        $data->transform(function ($payslip) {
            if (is_string($payslip->other)) {
                $payslip->other = json_decode($payslip->other, true);
            }

            return $payslip;
        });

        return response()->json($data);
    }

    public function savePayslip(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
            'payslip_id' => 'nullable|integer',
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
            'earnings_gross' => 'numeric|nullable',
            'earnings_bonus' => 'numeric|nullable',
            'earnings_net_pay' => 'numeric|nullable',
            'earnings_rsu' => 'numeric|nullable',
            'imp_other' => 'numeric|nullable',
            'imp_legal' => 'numeric|nullable',
            'imp_fitness' => 'numeric|nullable',
            'imp_ltd' => 'numeric|nullable',
            'ps_oasdi' => 'numeric|nullable',
            'ps_medicare' => 'numeric|nullable',
            'ps_fed_tax' => 'numeric|nullable',
            'ps_fed_tax_addl' => 'numeric|nullable',
            'ps_state_tax' => 'numeric|nullable',
            'ps_state_tax_addl' => 'numeric|nullable',
            'ps_state_disability' => 'numeric|nullable',
            'ps_401k_pretax' => 'numeric|nullable',
            'ps_401k_aftertax' => 'numeric|nullable',
            'ps_401k_employer' => 'numeric|nullable',
            'ps_fed_tax_refunded' => 'numeric|nullable',
            'ps_payslip_file_hash' => 'string|nullable',
            'ps_is_estimated' => 'boolean',
            'ps_comment' => 'string|nullable',
            'ps_pretax_medical' => 'numeric|nullable',
            'ps_pretax_fsa' => 'numeric|nullable',
            'ps_salary' => 'numeric|nullable',
            'ps_vacation_payout' => 'numeric|nullable',
            'ps_pretax_dental' => 'numeric|nullable',
            'ps_pretax_vision' => 'numeric|nullable',
            'other' => 'nullable', // Will be handled manually
            'employment_entity_id' => 'nullable|integer|exists:fin_employment_entity,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        // Handle 'other' field
        if (isset($validatedData['other'])) {
            $validatedData['other'] = json_encode($validatedData['other']);
        } else {
            $validatedData['other'] = null;
        }

        $payslipId = $validatedData['payslip_id'] ?? null;
        unset($validatedData['payslip_id']);

        if ($payslipId) {
            FinPayslips::where('payslip_id', $payslipId)
                ->where('uid', $uid)
                ->update($validatedData);
        } else {
            $validatedData['uid'] = $uid;
            FinPayslips::create($validatedData);
        }

        return response()->json(['success' => true]);
    }

    public function deletePayslip(Request $request, $payslip_id): JsonResponse
    {
        $uid = Auth::id();

        FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function fetchPayslipById(Request $request, $payslip_id): JsonResponse
    {
        $uid = Auth::id();

        $payslip = FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->firstOrFail();

        // Decode 'other' field
        if (is_string($payslip->other)) {
            $payslip->other = json_decode($payslip->other, true);
        }

        return response()->json($payslip);
    }

    public function updatePayslipEstimatedStatus(Request $request, $payslip_id): JsonResponse
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
            'ps_is_estimated' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->update(['ps_is_estimated' => $validatedData['ps_is_estimated']]);

        return response()->json(['success' => true]);
    }

    /**
     * Return the LLM prompt and JSON schema for a payslip.
     * GET /api/payslips/prompt
     */
    public function getPrompt(Request $request): JsonResponse
    {
        $schema = [
            'type' => 'object',
            'description' => 'A single payslip record',
            'properties' => [
                'payslip_id' => ['type' => 'integer', 'description' => 'Existing payslip ID (omit when creating a new payslip)'],
                'period_start' => ['type' => 'string', 'description' => 'Pay period start date (YYYY-MM-DD)'],
                'period_end' => ['type' => 'string', 'description' => 'Pay period end date (YYYY-MM-DD)'],
                'pay_date' => ['type' => 'string', 'description' => 'Date the payment was issued (YYYY-MM-DD)'],
                'employment_entity_id' => ['type' => 'integer', 'nullable' => true, 'description' => 'ID of the W-2 employment entity'],
                'ps_salary' => ['type' => 'number', 'description' => 'Base salary / regular pay for this period'],
                'earnings_gross' => ['type' => 'number', 'description' => 'Total gross earnings (wages box)'],
                'earnings_bonus' => ['type' => 'number', 'description' => 'Bonus amount'],
                'earnings_rsu' => ['type' => 'number', 'description' => 'RSU / equity income included in gross'],
                'earnings_net_pay' => ['type' => 'number', 'description' => 'Net take-home pay after all deductions'],
                'ps_vacation_payout' => ['type' => 'number', 'description' => 'Vacation cash-out / payout'],
                'imp_legal' => ['type' => 'number', 'description' => 'Imputed income: legal plan'],
                'imp_fitness' => ['type' => 'number', 'description' => 'Imputed income: fitness / gym'],
                'imp_ltd' => ['type' => 'number', 'description' => 'Imputed income: long-term disability'],
                'imp_other' => ['type' => 'number', 'description' => 'Other imputed income'],
                'ps_oasdi' => ['type' => 'number', 'description' => 'Social Security (OASDI) tax withheld'],
                'ps_medicare' => ['type' => 'number', 'description' => 'Medicare tax withheld'],
                'ps_fed_tax' => ['type' => 'number', 'description' => 'Federal income tax withheld'],
                'ps_fed_tax_addl' => ['type' => 'number', 'description' => 'Additional federal withholding'],
                'ps_fed_tax_refunded' => ['type' => 'number', 'description' => 'Federal tax refunded on this payslip'],
                'ps_state_tax' => ['type' => 'number', 'description' => 'State income tax withheld'],
                'ps_state_disability' => ['type' => 'number', 'description' => 'State disability insurance (SDI/SUI)'],
                'ps_state_tax_addl' => ['type' => 'number', 'description' => 'Additional state withholding'],
                'ps_401k_pretax' => ['type' => 'number', 'description' => 'Pre-tax 401(k) employee contribution'],
                'ps_401k_aftertax' => ['type' => 'number', 'description' => 'After-tax (Roth) 401(k) employee contribution'],
                'ps_401k_employer' => ['type' => 'number', 'description' => 'Employer 401(k) match'],
                'ps_pretax_medical' => ['type' => 'number', 'description' => 'Pre-tax medical insurance premium'],
                'ps_pretax_dental' => ['type' => 'number', 'description' => 'Pre-tax dental insurance premium'],
                'ps_pretax_vision' => ['type' => 'number', 'description' => 'Pre-tax vision insurance premium'],
                'ps_pretax_fsa' => ['type' => 'number', 'description' => 'Pre-tax FSA contribution'],
                'ps_is_estimated' => ['type' => 'boolean', 'description' => 'True if these values are estimates'],
                'ps_comment' => ['type' => 'string', 'nullable' => true, 'description' => 'Optional notes'],
            ],
            'required' => ['period_start', 'period_end', 'pay_date'],
        ];

        $prompt = <<<'PROMPT'
You are a payroll data extraction assistant. Extract all payroll information from the provided payslip document and return it as a JSON object matching the schema below.

Guidelines:
- All monetary values should be plain numbers (no currency symbols or commas).
- Dates must be in YYYY-MM-DD format.
- Omit fields that are not present on the payslip rather than returning 0.
- earnings_gross should be the total gross pay (before deductions) including salary, bonus, RSU, and other earnings.
- ps_salary should be only the base/regular salary component (not including bonus, RSU, etc.).
- Include all withholding taxes and deductions shown on the payslip.
- If a value is labeled "YTD" (year-to-date) rather than "current", skip it — only capture the current-period amounts.

Return only a valid JSON object with no additional text or explanation.
PROMPT;

        return response()->json([
            'prompt' => trim($prompt),
            'json_schema' => $schema,
            'form_label' => 'Payslip',
        ]);
    }

    /**
     * Bulk save (upsert) an array of payslips.
     * POST /api/payslips/bulk
     *
     * Accepts a JSON array of payslip objects. Each item is validated with the
     * same rules as savePayslip(). Items with a payslip_id are updated; items
     * without are inserted.
     */
    public function bulkSave(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $items = $request->json()->all();

        if (! is_array($items)) {
            return response()->json(['error' => 'Request body must be a JSON array of payslips.'], 422);
        }

        $payslipRules = [
            'payslip_id' => 'nullable|integer',
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
            'earnings_gross' => 'numeric|nullable',
            'earnings_bonus' => 'numeric|nullable',
            'earnings_net_pay' => 'numeric|nullable',
            'earnings_rsu' => 'numeric|nullable',
            'imp_other' => 'numeric|nullable',
            'imp_legal' => 'numeric|nullable',
            'imp_fitness' => 'numeric|nullable',
            'imp_ltd' => 'numeric|nullable',
            'ps_oasdi' => 'numeric|nullable',
            'ps_medicare' => 'numeric|nullable',
            'ps_fed_tax' => 'numeric|nullable',
            'ps_fed_tax_addl' => 'numeric|nullable',
            'ps_state_tax' => 'numeric|nullable',
            'ps_state_tax_addl' => 'numeric|nullable',
            'ps_state_disability' => 'numeric|nullable',
            'ps_401k_pretax' => 'numeric|nullable',
            'ps_401k_aftertax' => 'numeric|nullable',
            'ps_401k_employer' => 'numeric|nullable',
            'ps_fed_tax_refunded' => 'numeric|nullable',
            'ps_payslip_file_hash' => 'string|nullable',
            'ps_is_estimated' => 'boolean',
            'ps_comment' => 'string|nullable',
            'ps_pretax_medical' => 'numeric|nullable',
            'ps_pretax_fsa' => 'numeric|nullable',
            'ps_salary' => 'numeric|nullable',
            'ps_vacation_payout' => 'numeric|nullable',
            'ps_pretax_dental' => 'numeric|nullable',
            'ps_pretax_vision' => 'numeric|nullable',
            'other' => 'nullable',
            'employment_entity_id' => 'nullable|integer|exists:fin_employment_entity,id',
        ];

        $allErrors = [];
        $validatedItems = [];

        foreach ($items as $index => $item) {
            $validator = Validator::make(is_array($item) ? $item : [], $payslipRules);
            if ($validator->fails()) {
                foreach ($validator->errors()->toArray() as $field => $messages) {
                    $allErrors["[{$index}].{$field}"] = $messages;
                }
            } else {
                $validatedItems[] = [$index, $validator->validated()];
            }
        }

        if (! empty($allErrors)) {
            return response()->json(['errors' => $allErrors], 422);
        }

        $saved = 0;
        foreach ($validatedItems as [$index, $data]) {
            if (isset($data['other'])) {
                $data['other'] = json_encode($data['other']);
            } else {
                $data['other'] = null;
            }

            $payslipId = $data['payslip_id'] ?? null;
            unset($data['payslip_id']);

            if ($payslipId) {
                $updated = FinPayslips::where('payslip_id', $payslipId)
                    ->where('uid', $uid)
                    ->update($data);
                if ($updated) {
                    $saved++;
                }
            } else {
                $data['uid'] = $uid;
                FinPayslips::create($data);
                $saved++;
            }
        }

        return response()->json(['success' => true, 'saved' => $saved]);
    }
}
