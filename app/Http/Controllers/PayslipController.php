<?php

namespace App\Http\Controllers;

use App\Models\FinPayslips;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class PayslipController extends Controller
{
    public function index()
    {
        return view('payslip');
    }

    public function fetchPayslipYears()
    {
        $uid = Auth::id();

        $years = FinPayslips::where('uid', $uid)
            ->selectRaw('DISTINCT SUBSTRING(pay_date, 1, 4) as year')
            ->orderBy('year', 'asc')
            ->get()
            ->pluck('year')
            ->toArray();

        // Add current year if not present
        $currentYear = (string)date('Y');
        if (!in_array($currentYear, $years)) {
            $years[] = $currentYear;
        }

        rsort($years); // Sort in descending order

        return response()->json($years);
    }

    public function fetchPayslips(Request $request)
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

    public function savePayslip(Request $request)
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
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
            'originalPeriodStart' => 'date_format:Y-m-d|nullable',
            'originalPeriodEnd' => 'date_format:Y-m-d|nullable',
            'originalPayDate' => 'date_format:Y-m-d|nullable',
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

        $lookupDates = [
            'period_start' => $validatedData['originalPeriodStart'] ?? $validatedData['period_start'],
            'period_end' => $validatedData['originalPeriodEnd'] ?? $validatedData['period_end'],
            'pay_date' => $validatedData['originalPayDate'] ?? $validatedData['pay_date'],
        ];

        unset($validatedData['originalPeriodStart']);
        unset($validatedData['originalPeriodEnd']);
        unset($validatedData['originalPayDate']);

        FinPayslips::updateOrCreate(
            [
                'uid' => $uid,
                'period_start' => $lookupDates['period_start'],
                'period_end' => $lookupDates['period_end'],
                'pay_date' => $lookupDates['pay_date'],
            ],
            $validatedData
        );

        return response()->json(['success' => true]);
    }

    public function deletePayslip(Request $request)
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        FinPayslips::where('uid', $uid)
            ->where('period_start', $validatedData['period_start'])
            ->where('period_end', $validatedData['period_end'])
            ->where('pay_date', $validatedData['pay_date'])
            ->delete();

        return response()->json(['success' => true]);
    }

    public function fetchPayslipByDetails(Request $request)
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        $payslip = FinPayslips::where('uid', $uid)
            ->where('period_start', $validatedData['period_start'])
            ->where('period_end', $validatedData['period_end'])
            ->where('pay_date', $validatedData['pay_date'])
            ->firstOrFail();

        // Decode 'other' field
        if (is_string($payslip->other)) {
            $payslip->other = json_decode($payslip->other, true);
        }

        return response()->json($payslip);
    }

    public function updatePayslipEstimatedStatus(Request $request)
    {
        $uid = Auth::id();

        $validator = Validator::make($request->all(), [
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
            'ps_is_estimated' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        FinPayslips::where('uid', $uid)
            ->where('period_start', $validatedData['period_start'])
            ->where('period_end', $validatedData['period_end'])
            ->where('pay_date', $validatedData['pay_date'])
            ->update(['ps_is_estimated' => $validatedData['ps_is_estimated']]);

        return response()->json(['success' => true]);
    }
}