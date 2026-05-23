<?php

namespace App\Http\Controllers\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinPayslips;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class FinancePayslipImportController extends Controller
{
    public function confirm(Request $request, int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', 'finance_payslip')
            ->firstOrFail();

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        $payload = array_merge(
            $result->getResultArray(),
            array_filter([
                'employment_entity_id' => $job->getContextArray()['employment_entity_id'] ?? null,
            ], static fn ($value) => $value !== null),
            $request->all(),
            ['ps_is_estimated' => true],
        );

        $validator = Validator::make($payload, $this->payslipRules((int) $user->id));
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validated = $validator->validated();
        unset($validated['payslip_id'], $validated['uid'], $validated['original_filename']);

        $payslip = FinPayslips::create($validated);

        $result->markImported();
        $this->maybeMarkJobImported($job);

        return response()->json([
            'payslip' => $payslip->fresh(),
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ], 201);
    }

    public function skip(int $jobId, int $resultId): JsonResponse
    {
        $user = Auth::user();

        $job = GenAiImportJob::query()
            ->where('id', $jobId)
            ->where('user_id', $user->id)
            ->where('job_type', 'finance_payslip')
            ->firstOrFail();

        $result = GenAiImportResult::query()
            ->where('id', $resultId)
            ->where('job_id', $job->id)
            ->firstOrFail();

        if ($result->status === 'imported') {
            return response()->json(['error' => 'This result has already been imported.'], 409);
        }

        $result->markSkipped();
        $this->maybeMarkJobImported($job);

        return response()->json([
            'result' => $result->refresh(),
            'job_status' => $job->refresh()->status,
        ]);
    }

    /**
     * @return array<string, array<int, ValidationRule|string>|string>
     */
    private function payslipRules(int $userId): array
    {
        return [
            'payslip_id' => 'nullable|integer',
            'period_start' => 'required|date_format:Y-m-d',
            'period_end' => 'required|date_format:Y-m-d',
            'pay_date' => 'required|date_format:Y-m-d',
            'earnings_gross' => 'numeric|nullable',
            'earnings_bonus' => 'numeric|nullable',
            'earnings_net_pay' => 'numeric|nullable',
            'earnings_rsu' => 'numeric|nullable',
            'earnings_dividend_equivalent' => 'numeric|nullable',
            'imp_other' => 'numeric|nullable',
            'imp_legal' => 'numeric|nullable',
            'imp_fitness' => 'numeric|nullable',
            'imp_ltd' => 'numeric|nullable',
            'imp_life_choice' => 'numeric|nullable',
            'ps_oasdi' => 'numeric|nullable',
            'ps_medicare' => 'numeric|nullable',
            'ps_fed_tax' => 'numeric|nullable',
            'ps_fed_tax_addl' => 'numeric|nullable',
            'ps_fed_tax_refunded' => 'numeric|nullable',
            'taxable_wages_oasdi' => 'numeric|nullable',
            'taxable_wages_medicare' => 'numeric|nullable',
            'taxable_wages_federal' => 'numeric|nullable',
            'ps_rsu_tax_offset' => 'numeric|nullable',
            'ps_rsu_excess_refund' => 'numeric|nullable',
            'ps_401k_pretax' => 'numeric|nullable',
            'ps_401k_aftertax' => 'numeric|nullable',
            'ps_401k_employer' => 'numeric|nullable',
            'ps_pretax_medical' => 'numeric|nullable',
            'ps_pretax_fsa' => 'numeric|nullable',
            'ps_salary' => 'numeric|nullable',
            'ps_vacation_payout' => 'numeric|nullable',
            'ps_pretax_dental' => 'numeric|nullable',
            'ps_pretax_vision' => 'numeric|nullable',
            'pto_accrued' => 'numeric|nullable',
            'pto_used' => 'numeric|nullable',
            'pto_available' => 'numeric|nullable',
            'pto_statutory_available' => 'numeric|nullable',
            'hours_worked' => 'numeric|nullable',
            'ps_payslip_file_hash' => 'string|nullable',
            'ps_is_estimated' => 'boolean',
            'ps_comment' => 'string|nullable',
            'other' => 'nullable|array',
            'employment_entity_id' => [
                'nullable',
                'integer',
                Rule::exists('fin_employment_entity', 'id')->where('user_id', $userId),
            ],
        ];
    }

    private function maybeMarkJobImported(GenAiImportJob $job): void
    {
        $stillPending = $job->results()->where('status', 'pending_review')->exists();
        if (! $stillPending && $job->status !== 'imported') {
            $job->markImported();
        }
    }
}
