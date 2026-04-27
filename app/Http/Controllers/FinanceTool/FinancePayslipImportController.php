<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinPayslips;
use Bherila\GenAiLaravel\Clients\GeminiClient;
use Bherila\GenAiLaravel\Exceptions\GenAiRateLimitException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class FinancePayslipImportController extends Controller
{
    public function import(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'files' => 'required|array|max:100',
            'files.*' => 'required|file',
            'employment_entity_id' => 'nullable|integer|exists:fin_employment_entity,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = Auth::user();
        $apiKey = $user->getGeminiApiKey();

        if (! $apiKey) {
            return response()->json(['error' => 'Gemini API key is not set.'], 400);
        }

        $files = $request->file('files');
        $gemini = new GeminiClient($apiKey);
        $prompt = $this->getPrompt(1);

        $successful_imports = 0;
        $failed_imports = 0;

        foreach ($files as $file) {
            $originalFilename = $file->getClientOriginalName();
            $geminiFileUri = null;

            try {
                $fileStream = fopen($file->getRealPath(), 'r');
                try {
                    $geminiFileUri = $gemini->uploadFile($fileStream, 'application/pdf', 'payslip-import-'.time());
                } finally {
                    if (is_resource($fileStream)) {
                        fclose($fileStream);
                    }
                }

                if (! $geminiFileUri) {
                    Log::error('Failed to upload payslip to Gemini File API', ['filename' => $originalFilename, 'user_id' => $user->id]);
                    $failed_imports++;

                    continue;
                }

                $filePrompt = "Filename: {$originalFilename}\n\n{$prompt}";
                $response = $gemini->converseWithFileRef($geminiFileUri, 'application/pdf', $filePrompt);
                $data = json_decode($gemini->extractText($response), true);

                if (! is_array($data)) {
                    Log::error('Failed to decode Gemini JSON for payslip import', ['filename' => $originalFilename, 'user_id' => $user->id]);
                    $failed_imports++;

                    continue;
                }

                $payslips = isset($data[0]) ? $data : [$data];

                foreach ($payslips as $payslipData) {
                    $payslipData['uid'] = $user->id;
                    $payslipData['ps_is_estimated'] = true;
                    if ($request->filled('employment_entity_id')) {
                        $payslipData['employment_entity_id'] = $request->input('employment_entity_id');
                    }
                    $payslipData = array_filter($payslipData, fn ($value) => $value !== null);
                    unset($payslipData['original_filename']);

                    try {
                        FinPayslips::create($payslipData);
                        $successful_imports++;
                    } catch (\Exception $e) {
                        Log::error('Failed to save payslip data: '.$e->getMessage(), ['data' => $payslipData]);
                        $failed_imports++;
                    }
                }
            } catch (GenAiRateLimitException) {
                return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
            } catch (Throwable $e) {
                Log::error('Error processing payslip file: '.$e->getMessage(), ['filename' => $originalFilename, 'user_id' => $user->id]);

                return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
            } finally {
                if ($geminiFileUri) {
                    $gemini->deleteFile($geminiFileUri);
                }
            }
        }

        $message = "Import processing complete. Processed {$successful_imports} payslip record(s).";

        Log::info('Payslip import summary for user ID '.$user->id, [
            'successful_imports' => $successful_imports,
            'failed_imports' => $failed_imports,
        ]);

        return response()->json([
            'success' => true,
            'message' => $message,
            'successful_imports' => $successful_imports,
            'failed_imports' => $failed_imports,
        ]);
    }

    private function getPrompt(int $fileCount): string
    {
        return <<<PROMPT
Analyze the provided {$fileCount} payslip PDF document(s).
I have provided each file preceded by "Filename: [name]".

For EACH file, extract the following fields.
Return a SINGLE JSON ARRAY containing objects.
If a single file contains multiple payslips, create separate objects for each payslip, using the same `original_filename`.

**JSON Fields:**
- `original_filename`: The filename provided.
- `period_start`: Pay period start date (YYYY-MM-DD)
- `period_end`: Pay period end date (YYYY-MM-DD)
- `pay_date`: The date the payment was issued (YYYY-MM-DD)
- `earnings_gross`: Gross pay amount (numeric)
- `earnings_bonus`: Bonus amount, if any (numeric)
- `earnings_net_pay`: Net pay amount (numeric)
- `earnings_rsu`: Value of Restricted Stock Units (RSUs) vested, if any (numeric)
- `imp_other`: Imputed income, if any (numeric)
- `imp_legal`: Imputed income for legal services, if any (numeric)
- `imp_fitness`: Imputed income for fitness benefits, including "Life@ Choice" if any (numeric)
- `imp_ltd`: Imputed income for long-term disability, if any (numeric)
- `ps_oasdi`: Employee OASDI (Social Security) tax (numeric)
- `ps_medicare`: Employee Medicare tax (numeric)
- `ps_fed_tax`: Federal income tax withheld (numeric)
- `ps_fed_tax_addl`: Additional federal tax withheld, if any (numeric)
- `ps_state_tax`: State income tax withheld (numeric)
- `ps_state_tax_addl`: Additional state tax withheld, if any (numeric)
- `ps_state_disability`: State disability insurance deduction (numeric)
- `ps_401k_pretax`: Pre-tax 401(k) contribution (numeric)
- `ps_401k_aftertax`: After-tax/Roth 401(k) contribution (numeric)
- `ps_401k_employer`: Employer 401(k) contribution (numeric)
- `ps_pretax_medical`: Pre-tax medical deduction (numeric)
- `ps_pretax_dental`: Pre-tax dental deduction (numeric)
- `ps_pretax_vision`: Pre-tax vision deduction (numeric)
- `ps_pretax_fsa`: Pre-tax Flexible Spending Account (FSA) deduction (numeric)
- `ps_salary`: Salary amount for the period (numeric)
- `ps_vacation_payout`: Payout for unused vacation time, if any (numeric)
- `ps_comment`: Any notes or comments.

**Instructions:**
1.  Return the data in a clean JSON format. Do not include any explanatory text outside of the JSON structure.
2.  If a field is not present in the document, omit it from the JSON or set its value to `null`.
3.  All monetary values should be numbers (e.g., `1234.56`).
4.  All dates must be in `YYYY-MM-DD` format.

PROMPT;
    }
}
