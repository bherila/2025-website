<?php

namespace App\Http\Controllers;

use App\Models\FinPayslips;
use Illuminate\Http\Client\Pool;
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
        // Set execution time limit to 5 minutes to handle multiple API requests
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'files' => 'required|array|max:10',
            'files.*' => 'required|file|max:10240', // 10MB max
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
        $successful_imports = 0;
        $failed_imports = 0;

        $prompt = $this->getPrompt();

        try {
            $apiResponses = Http::pool(function (Pool $pool) use ($files, $apiKey, $prompt) {
                foreach ($files as $file) {
                    $pool->as($file->getClientOriginalName())->withOptions([
                        'timeout' => 120, // 2 minutes timeout
                    ])->withHeaders([
                        'x-goog-api-key' => $apiKey,
                        'Content-Type' => 'application/json',
                    ])->post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', [
                        'contents' => [
                            [
                                'parts' => [
                                    ['text' => $prompt],
                                    [
                                        'inline_data' => [
                                            'mime_type' => 'application/pdf',
                                            'data' => base64_encode($file->get()),
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        'generationConfig' => [
                            'response_mime_type' => 'application/json',
                        ],
                    ]);
                }
            });

            foreach ($apiResponses as $fileName => $response) {
                if ($response->successful()) {
                    $json_string = $response->json()['candidates'][0]['content']['parts'][0]['text'];
                    $data = json_decode(str_replace(['```json', '```'], '', $json_string), true);

                    if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                        // The Gemini API might return a single object or an array of objects
                        $payslips = isset($data[0]) && is_array($data[0]) ? $data : [$data];

                        foreach ($payslips as $payslipData) {
                            $payslipData['uid'] = $user->id;
                            $payslipData['ps_is_estimated'] = true;

                            // Remove null values to rely on database defaults
                            $payslipData = array_filter($payslipData, function ($value) {
                                return $value !== null;
                            });

                            FinPayslips::create($payslipData);
                            $successful_imports++;
                        }
                    } else {
                        Log::error('Failed to decode JSON from Gemini API for file: '.$fileName, [
                            'response' => $response->body(),
                        ]);
                        $failed_imports++;
                    }
                } else {
                    Log::error('Gemini API request failed for file: '.$fileName, [
                        'status' => $response->status(),
                        'response' => $response->body(),
                    ]);
                    $failed_imports++;
                    if ($response->status() == 429) {
                        return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                    }
                }
            }
        } catch (Throwable $e) {
            Log::error('Error during payslip import: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }

        $message = "Import complete. Successfully imported {$successful_imports} payslip(s).";
        if ($failed_imports > 0) {
            $message .= " Failed to import data from {$failed_imports} file(s).";
        }

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

    private function getPrompt()
    {
        return <<<'PROMPT'
Analyze the provided payslip PDF document and extract the following fields in JSON format.

**JSON Fields:**
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
5.  If the document contains multiple payslips, return a JSON array of objects.

Example Output:
```json
{
  "pay_date": "2025-08-10",
  "period_start": "2025-07-27",
  "period_end": "2025-08-09",
  "earnings_gross": 10000.00,
  "earnings_net_pay": 7000.00,
  "ps_fed_tax": 1500.00,
  "ps_state_tax": 500.00,
  "ps_oasdi": 620.00,
  "ps_medicare": 145.00,
  "ps_401k_pretax": 235.00
}
```
PROMPT;
    }
}
