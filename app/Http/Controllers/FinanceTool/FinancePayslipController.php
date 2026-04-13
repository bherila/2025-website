<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinPayslipDeposit;
use App\Models\FinanceTool\FinPayslips;
use App\Models\FinanceTool\FinPayslipStateData;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class FinancePayslipController extends Controller
{
    // ─── Pages ───────────────────────────────────────────────────────────────

    public function index(): View
    {
        return view('payslip');
    }

    public function entry(): View
    {
        return view('payslip-entry');
    }

    // ─── Validation rules (shared by savePayslip and bulkSave) ───────────────

    /**
     * Canonical validation rules for a single payslip payload.
     *
     * PHP rules MUST stay in sync with fin_payslip_schema in payslipDbCols.ts.
     *
     * @return array<string, string>
     */
    private function payslipRules(): array
    {
        return [
            'payslip_id' => 'nullable|integer',
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
            // Earnings
            'earnings_gross' => 'numeric|nullable',
            'earnings_bonus' => 'numeric|nullable',
            'earnings_net_pay' => 'numeric|nullable',
            'earnings_rsu' => 'numeric|nullable',
            'earnings_dividend_equivalent' => 'numeric|nullable',
            // Imputed income
            'imp_other' => 'numeric|nullable',
            'imp_legal' => 'numeric|nullable',
            'imp_fitness' => 'numeric|nullable',
            'imp_ltd' => 'numeric|nullable',
            'imp_life_choice' => 'numeric|nullable',
            // Federal taxes
            'ps_oasdi' => 'numeric|nullable',
            'ps_medicare' => 'numeric|nullable',
            'ps_fed_tax' => 'numeric|nullable',
            'ps_fed_tax_addl' => 'numeric|nullable',
            'ps_fed_tax_refunded' => 'numeric|nullable',
            // Taxable wage bases
            'taxable_wages_oasdi' => 'numeric|nullable',
            'taxable_wages_medicare' => 'numeric|nullable',
            'taxable_wages_federal' => 'numeric|nullable',
            // RSU post-tax offsets
            'ps_rsu_tax_offset' => 'numeric|nullable',
            'ps_rsu_excess_refund' => 'numeric|nullable',
            // Retirement
            'ps_401k_pretax' => 'numeric|nullable',
            'ps_401k_aftertax' => 'numeric|nullable',
            'ps_401k_employer' => 'numeric|nullable',
            // Pre-tax deductions
            'ps_pretax_medical' => 'numeric|nullable',
            'ps_pretax_fsa' => 'numeric|nullable',
            'ps_salary' => 'numeric|nullable',
            'ps_vacation_payout' => 'numeric|nullable',
            'ps_pretax_dental' => 'numeric|nullable',
            'ps_pretax_vision' => 'numeric|nullable',
            // PTO / hours
            'pto_accrued' => 'numeric|nullable',
            'pto_used' => 'numeric|nullable',
            'pto_available' => 'numeric|nullable',
            'pto_statutory_available' => 'numeric|nullable',
            'hours_worked' => 'numeric|nullable',
            // Meta
            'ps_payslip_file_hash' => 'string|nullable',
            'ps_is_estimated' => 'boolean',
            'ps_comment' => 'string|nullable',
            'other' => 'nullable|array', // catch-all JSON object
            'employment_entity_id' => 'nullable|integer|exists:fin_employment_entity,id',
        ];
    }

    // ─── Payslip years ────────────────────────────────────────────────────────

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

    // ─── Payslip CRUD ─────────────────────────────────────────────────────────

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
            ->with(['stateData', 'deposits'])
            ->get();

        $data->transform(fn ($p) => $this->transformPayslip($p));

        return response()->json($data);
    }

    public function savePayslip(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), $this->payslipRules());

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        // Encode other as JSON if present
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

    public function deletePayslip(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();

        $payslip = FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->first();

        if ($payslip) {
            $payslip->delete();
        }

        return response()->json(['success' => true]);
    }

    public function fetchPayslipById(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();

        $payslip = FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->with(['stateData', 'deposits'])
            ->firstOrFail();

        return response()->json($this->transformPayslip($payslip));
    }

    public function updatePayslipEstimatedStatus(Request $request, int $payslip_id): JsonResponse
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

    // ─── Deposits CRUD ────────────────────────────────────────────────────────

    public function fetchDeposits(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        $deposits = FinPayslipDeposit::where('payslip_id', $payslip_id)->get();

        return response()->json($deposits);
    }

    public function saveDeposit(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        $validator = Validator::make($request->all(), [
            'id' => 'nullable|integer',
            'bank_name' => 'required|string|max:100',
            'account_last4' => 'nullable|string|max:4',
            'amount' => 'required|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();
        $depositId = $data['id'] ?? null;
        unset($data['id']);
        $data['payslip_id'] = $payslip_id;

        if ($depositId) {
            FinPayslipDeposit::where('id', $depositId)
                ->where('payslip_id', $payslip_id)
                ->update($data);
        } else {
            FinPayslipDeposit::create($data);
        }

        return response()->json(['success' => true]);
    }

    public function deleteDeposit(Request $request, int $payslip_id, int $deposit_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        FinPayslipDeposit::where('id', $deposit_id)
            ->where('payslip_id', $payslip_id)
            ->delete();

        return response()->json(['success' => true]);
    }

    // ─── State data CRUD ──────────────────────────────────────────────────────

    public function fetchStateData(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        $stateData = FinPayslipStateData::where('payslip_id', $payslip_id)->get();

        return response()->json($stateData);
    }

    public function saveStateData(Request $request, int $payslip_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        $validator = Validator::make($request->all(), [
            'id' => 'nullable|integer',
            'state_code' => 'required|string|size:2',
            'taxable_wages' => 'numeric|nullable',
            'state_tax' => 'numeric|nullable',
            'state_tax_addl' => 'numeric|nullable',
            'state_disability' => 'numeric|nullable',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();
        $stateDataId = $data['id'] ?? null;
        unset($data['id']);
        $data['payslip_id'] = $payslip_id;

        if ($stateDataId) {
            FinPayslipStateData::where('id', $stateDataId)
                ->where('payslip_id', $payslip_id)
                ->update($data);
        } else {
            FinPayslipStateData::create($data);
        }

        return response()->json(['success' => true]);
    }

    public function deleteStateData(Request $request, int $payslip_id, int $state_data_id): JsonResponse
    {
        $uid = Auth::id();
        $this->authorizePayslip($uid, $payslip_id);

        FinPayslipStateData::where('id', $state_data_id)
            ->where('payslip_id', $payslip_id)
            ->delete();

        return response()->json(['success' => true]);
    }

    // ─── LLM extraction prompt (Claude tool calling) ──────────────────────────

    /**
     * Return a Claude tool-calling prompt for LLM payslip extraction.
     * GET /api/payslips/prompt
     *
     * Returns a `tools` array with a single `extract_payslip` tool and
     * `tool_choice: forced` so the LLM always produces schema-valid output.
     * The `state_data` array replaces the old flat state columns.
     *
     * PHP rules in payslipRules() MUST stay in sync with `input_schema` below.
     */
    public function getPrompt(Request $request): JsonResponse
    {
        $inputSchema = [
            'type' => 'object',
            'description' => 'A single payslip record extracted from the document',
            'properties' => [
                'period_start' => ['type' => 'string', 'description' => 'Pay period start date (YYYY-MM-DD)'],
                'period_end' => ['type' => 'string', 'description' => 'Pay period end date (YYYY-MM-DD)'],
                'pay_date' => ['type' => 'string', 'description' => 'Date the payment was issued (YYYY-MM-DD)'],
                'employment_entity_id' => ['type' => 'integer', 'description' => 'ID of the W-2 employment entity (omit if unknown)'],
                // Earnings
                'ps_salary' => ['type' => 'number', 'description' => 'Base salary / regular pay for this period'],
                'earnings_gross' => ['type' => 'number', 'description' => 'Total gross earnings (wages box)'],
                'earnings_bonus' => ['type' => 'number', 'description' => 'Bonus amount'],
                'earnings_rsu' => ['type' => 'number', 'description' => 'RSU / equity income included in gross'],
                'earnings_dividend_equivalent' => ['type' => 'number', 'description' => 'Dividend equivalent payments on unvested RSUs'],
                'earnings_net_pay' => ['type' => 'number', 'description' => 'Net take-home pay after all deductions'],
                'ps_vacation_payout' => ['type' => 'number', 'description' => 'Vacation cash-out / payout'],
                // Imputed income
                'imp_legal' => ['type' => 'number', 'description' => 'Imputed income: legal plan'],
                'imp_fitness' => ['type' => 'number', 'description' => 'Imputed income: fitness / gym'],
                'imp_ltd' => ['type' => 'number', 'description' => 'Imputed income: long-term disability'],
                'imp_life_choice' => ['type' => 'number', 'description' => 'Imputed income: Life@ Choice benefit'],
                'imp_other' => ['type' => 'number', 'description' => 'Other imputed income'],
                // Federal taxes
                'ps_oasdi' => ['type' => 'number', 'description' => 'Social Security (OASDI) tax withheld'],
                'ps_medicare' => ['type' => 'number', 'description' => 'Medicare tax withheld'],
                'ps_fed_tax' => ['type' => 'number', 'description' => 'Federal income tax withheld'],
                'ps_fed_tax_addl' => ['type' => 'number', 'description' => 'Additional federal withholding'],
                'ps_fed_tax_refunded' => ['type' => 'number', 'description' => 'Federal tax refunded on this payslip'],
                // Taxable wage bases
                'taxable_wages_oasdi' => ['type' => 'number', 'description' => 'OASDI taxable wages from the Taxable Wages table'],
                'taxable_wages_medicare' => ['type' => 'number', 'description' => 'Medicare taxable wages from the Taxable Wages table'],
                'taxable_wages_federal' => ['type' => 'number', 'description' => 'Federal income tax taxable wages (labelled "Federal Withholding - Taxable Wages")'],
                // RSU post-tax offsets — appear as negative in Post Tax Deductions; store as POSITIVE
                'ps_rsu_tax_offset' => ['type' => 'number', 'description' => 'RSU tax pre-paid via sell-to-cover; capture as positive absolute value from negative "Post Tax Deductions" line'],
                'ps_rsu_excess_refund' => ['type' => 'number', 'description' => 'Refund of over-withheld RSU tax from a prior period; capture as positive absolute value'],
                // Retirement
                'ps_401k_pretax' => ['type' => 'number', 'description' => 'Pre-tax 401(k) employee contribution (salary + bonus combined)'],
                'ps_401k_aftertax' => ['type' => 'number', 'description' => 'After-tax (Roth) 401(k) employee contribution (salary + bonus combined)'],
                'ps_401k_employer' => ['type' => 'number', 'description' => 'Employer 401(k) match'],
                // Pre-tax deductions
                'ps_pretax_medical' => ['type' => 'number', 'description' => 'Pre-tax medical insurance premium'],
                'ps_pretax_dental' => ['type' => 'number', 'description' => 'Pre-tax dental insurance premium'],
                'ps_pretax_vision' => ['type' => 'number', 'description' => 'Pre-tax vision insurance premium'],
                'ps_pretax_fsa' => ['type' => 'number', 'description' => 'Pre-tax FSA contribution'],
                // PTO
                'pto_accrued' => ['type' => 'number', 'description' => 'PTO hours accrued this period'],
                'pto_used' => ['type' => 'number', 'description' => 'PTO hours used this period'],
                'pto_available' => ['type' => 'number', 'description' => 'PTO available balance (hours)'],
                'pto_statutory_available' => ['type' => 'number', 'description' => 'Statutory PTO available balance (hours)'],
                'hours_worked' => ['type' => 'number', 'description' => 'Hours worked this period (0 on vest-only payslips)'],
                // State data (replaces flat columns)
                'state_data' => [
                    'type' => 'array',
                    'description' => 'Per-state tax data extracted from the payslip',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'state_code' => ['type' => 'string', 'description' => 'Two-letter state code, e.g. CA'],
                            'taxable_wages' => ['type' => 'number', 'description' => 'State taxable wages'],
                            'state_tax' => ['type' => 'number', 'description' => 'State income tax withheld'],
                            'state_tax_addl' => ['type' => 'number', 'description' => 'Additional state withholding'],
                            'state_disability' => ['type' => 'number', 'description' => 'State disability insurance (SDI/SUI)'],
                        ],
                        'required' => ['state_code'],
                    ],
                ],
                // Meta
                'ps_is_estimated' => ['type' => 'boolean', 'description' => 'True if these values are estimates'],
                'ps_comment' => ['type' => 'string', 'description' => 'Optional notes'],
                // Catch-all — any unrecognised payslip data; omit if nothing unrecognised
                'other' => [
                    'type' => 'object',
                    'description' => 'JSON object for any payslip data not mapped to a named field; omit if nothing unrecognised',
                    'additionalProperties' => true,
                ],
            ],
            'required' => ['period_start', 'period_end', 'pay_date'],
        ];

        $prompt = <<<'PROMPT'
You are a payroll data extraction assistant. Extract all payroll information from the provided payslip document and call the extract_payslip tool with the structured data.

Guidelines:
- All monetary values should be plain numbers (no currency symbols or commas).
- Dates must be in YYYY-MM-DD format.
- Omit fields that are not present on the payslip rather than returning 0.
- earnings_gross should be the total gross pay (before deductions) including salary, bonus, RSU, and other earnings.
- ps_salary should be only the base/regular salary component (not including bonus, RSU, etc.).
- If a value is labeled "YTD" (year-to-date) rather than "current", skip it — only capture the current-period amounts.
- ps_rsu_tax_offset and ps_rsu_excess_refund: these appear as NEGATIVE values in "Post Tax Deductions" — capture the POSITIVE absolute value.
- ps_401k_pretax and ps_401k_aftertax: capture the TOTAL including both salary and bonus components.
- taxable_wages_federal: from the "Taxable Wages" table, labelled "Federal Withholding - Taxable Wages".
- imp_life_choice: the "Life@ Choice" benefit imputed income line.
- state_data: include a row for each state shown on the payslip; do NOT include ps_state_tax / ps_state_tax_addl / ps_state_disability as top-level fields.
- other: JSON object for any payslip data not mapped to a named field; omit entirely if nothing is unrecognised.
PROMPT;

        return response()->json([
            'prompt' => trim($prompt),
            'tools' => [[
                'name' => 'extract_payslip',
                'description' => 'Record the extracted payslip data',
                'input_schema' => $inputSchema,
            ]],
            'tool_choice' => ['type' => 'tool', 'name' => 'extract_payslip'],
            'form_label' => 'Payslip',
        ]);
    }

    // ─── Bulk save ────────────────────────────────────────────────────────────

    /**
     * Bulk upsert an array of payslips.
     * POST /api/payslips/bulk
     */
    public function bulkSave(Request $request): JsonResponse
    {
        $uid = Auth::id();

        $items = $request->json()->all();

        if (! is_array($items) || ! array_is_list($items)) {
            return response()->json(['error' => 'Request body must be a JSON array of payslips.'], 422);
        }

        $payslipRules = $this->payslipRules();
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

        $saved = DB::transaction(function () use ($validatedItems, $uid): int {
            $count = 0;
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
                        $count++;
                    }
                } else {
                    $data['uid'] = $uid;
                    FinPayslips::create($data);
                    $count++;
                }
            }

            return $count;
        });

        return response()->json(['success' => true, 'saved' => $saved]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Ensure the authenticated user owns the given payslip.
     * Aborts with 403 if not.
     */
    private function authorizePayslip(int $uid, int $payslipId): void
    {
        $exists = FinPayslips::where('payslip_id', $payslipId)
            ->where('uid', $uid)
            ->exists();

        abort_unless($exists, 403, 'Forbidden');
    }

    /**
     * Normalise a payslip model for JSON output:
     * • Decode the `other` field if it is a JSON string.
     * • Rename the eager-loaded stateData relation to `state_data`.
     *
     * @return array<string, mixed>
     */
    private function transformPayslip(FinPayslips $payslip): array
    {
        $arr = $payslip->toArray();

        // Decode other field
        if (is_string($arr['other'] ?? null)) {
            $arr['other'] = json_decode($arr['other'], true);
        }

        // Laravel automatically serializes 'stateData' relation as 'state_data'
        // No manual transformation needed

        return $arr;
    }
}
