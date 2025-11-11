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

    public function entry()
    {
        return view('payslip-entry');
    }

    public function fetchPayslipYears()
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
            $currentYear = (string)date('Y');
            if (!in_array($currentYear, $years)) {
                $years[] = $currentYear;
            }

            rsort($years); // Sort in descending order

            return response()->json($years);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch payslip years: ' . $e->getMessage()], 500);
        }
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

    public function deletePayslip(Request $request, $payslip_id)
    {
        $uid = Auth::id();

        FinPayslips::where('payslip_id', $payslip_id)
            ->where('uid', $uid)
            ->delete();

        return response()->json(['success' => true]);
    }

    public function fetchPayslipById(Request $request, $payslip_id)
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

    public function updatePayslipEstimatedStatus(Request $request, $payslip_id)
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
}