<?php

namespace App\Http\Controllers;

use App\Models\FinPayslips;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class PayslipImportController extends Controller
{
    public function import(Request $request)
    {
        // Set execution time limit to 5 minutes to handle multiple files
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'files' => 'required|array|max:100',
            'files.*' => 'required|file',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $files = $request->file('files');

        // Calculate total size
        $totalSize = 0;
        foreach ($files as $file) {
            $totalSize += $file->getSize();
        }

        // Limit to 6MB
        if ($totalSize > 6 * 1024 * 1024) {
            return response()->json(['error' => 'Total file size exceeds the limit (6MB). Please upload fewer files.'], 422);
        }

        $user = Auth::user();
        $apiKey = $user->getGeminiApiKey();

        if (! $apiKey) {
            return response()->json(['error' => 'Gemini API key is not set.'], 400);
        }

        $successful_imports = 0;
        $failed_imports = 0;

        $prompt = $this->getPrompt(count($files));

        $parts = [];
        $parts[] = ['text' => $prompt];

        foreach ($files as $file) {
            $parts[] = ['text' => 'Filename: '.$file->getClientOriginalName()];
            $parts[] = [
                'inline_data' => [
                    'mime_type' => 'application/pdf',
                    'data' => base64_encode($file->get()),
                ],
            ];
        }

        try {
            $response = Http::withOptions([
                'timeout' => 180, // 3 minutes timeout
            ])->withHeaders([
                'x-goog-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ])->post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', [
                'contents' => [
                    [
                        'parts' => $parts,
                    ],
                ],
                'generationConfig' => [
                    'response_mime_type' => 'application/json',
                ],
            ]);

            if ($response->successful()) {
                $candidate = $response->json()['candidates'][0] ?? null;
                if (! $candidate) {
                    throw new \Exception('No candidates returned from Gemini API');
                }

                $json_string = $candidate['content']['parts'][0]['text'];
                $data = json_decode(str_replace(['```json', '```'], '', $json_string), true);

                if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                    // The Gemini API returns an array of objects
                    $payslips = $data;

                    foreach ($payslips as $payslipData) {
                        $payslipData['uid'] = $user->id;
                        $payslipData['ps_is_estimated'] = true;

                        // Remove null values to rely on database defaults
                        $payslipData = array_filter($payslipData, function ($value) {
                            return $value !== null;
                        });

                        // We can optionally use 'original_filename' for logging or error reporting
                        // but strictly speaking FinPayslips doesn't store the filename currently.
                        // We remove it before creation just in case it's not in fillable
                        unset($payslipData['original_filename']);

                        try {
                            FinPayslips::create($payslipData);
                            $successful_imports++;
                        } catch (\Exception $e) {
                            Log::error('Failed to save payslip data: '.$e->getMessage(), ['data' => $payslipData]);
                            $failed_imports++;
                        }
                    }
                } else {
                    Log::error('Failed to decode JSON from Gemini API', [
                        'response' => $response->body(),
                    ]);
                    // If we can't parse JSON, we assume all failed
                    $failed_imports = count($files);
                }
            } else {
                Log::error('Gemini API request failed', [
                    'status' => $response->status(),
                    'response' => $response->body(),
                ]);
                if ($response->status() == 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }

                return response()->json(['error' => 'Gemini API request failed.'], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during payslip import: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
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

    private function getPrompt(int $fileCount)
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
