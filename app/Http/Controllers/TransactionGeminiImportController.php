<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class TransactionGeminiImportController extends Controller
{
    public function import(Request $request)
    {
        // Set execution time limit to 5 minutes to handle multiple API requests
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:pdf|max:10240', // 10MB max
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = Auth::user();
        $apiKey = $user->getGeminiApiKey();

        if (! $apiKey) {
            return response()->json(['error' => 'Gemini API key is not set.'], 400);
        }

        $file = $request->file('file');
        $prompt = $this->getPrompt();

        try {
            $response = Http::withHeaders([
                'x-goog-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ])->withOptions([
                'timeout' => 300,
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

            if ($response->successful()) {
                $json_text = $response->json()['candidates'][0]['content']['parts'][0]['text'];
                // Strip markdown code fences if present
                $json_text = preg_replace('/^```json\s*|\s*```$/s', '', trim($json_text));
                $data = json_decode($json_text, true);

                if (json_last_error() !== JSON_ERROR_NONE) {
                    Log::error('Failed to decode JSON from Gemini API', [
                        'file' => $file->getClientOriginalName(),
                        'response' => $json_text,
                    ]);

                    return response()->json(['error' => 'Failed to parse response from AI.'], 500);
                }

                return response()->json($data);
            } else {
                Log::error('Gemini API request failed for file: '.$file->getClientOriginalName(), [
                    'status' => $response->status(),
                    'response' => $response->body(),
                ]);
                if ($response->status() == 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }

                return response()->json(['error' => 'Failed to process the PDF file.'], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during transaction import: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
    }

    private function getPrompt()
    {
        return <<<'PROMPT'
Analyze the provided bank or brokerage statement PDF and extract:
1. Statement summary information
2. Statement detail line items (sections with MTD/YTD or period columns showing performance, capital, taxes, etc.)
3. Transaction entries (individual transactions with dates)

Return the data as JSON with this structure:

```json
{
  "statementInfo": {
    "brokerName": "Bank/Institution Name",
    "accountNumber": "Account number if visible",
    "accountName": "Account holder name if visible",
    "periodStart": "YYYY-MM-DD",
    "periodEnd": "YYYY-MM-DD",
    "closingBalance": 12345.67
  },
  "statementDetails": [
    {
      "section": "Statement Summary ($)",
      "line_item": "Pre-Tax Return",
      "statement_period_value": -23355.87,
      "ytd_value": 12312.59,
      "is_percentage": false
    },
    {
      "section": "Statement Summary (%)",
      "line_item": "Pre-Tax Return",
      "statement_period_value": -1.75,
      "ytd_value": 1.76,
      "is_percentage": true
    }
  ],
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Transaction description",
      "amount": 100.00,
      "type": "deposit"
    }
  ]
}
```

**Instructions:**
1. Return ONLY valid JSON with no other text.
2. All dates should be in YYYY-MM-DD format.
3. **Statement Details**: Extract ALL line items from sections with columns like "MTD" and "YTD", "Statement Period" and "YTD", or similar period-based columns. These include:
   - Statement Summary ($ and %)
   - Investor Capital Account
   - Fund Level Capital Account  
   - Tax and Pre-Tax Return Detail
   - Any similar summary/performance sections
4. For statement details:
   - `section`: The section header (e.g., "Statement Summary ($)", "Investor Capital Account")
   - `line_item`: The row label (e.g., "Pre-Tax Return", "Total Beginning Capital")
   - `statement_period_value`: The MTD/Statement Period value as a number
   - `ytd_value`: The YTD value as a number
   - `is_percentage`: true if the values are percentages, false if currency amounts
5. **Transactions**: Extract individual dated transactions (deposits, withdrawals, trades, etc.) if present.
6. Parse negative amounts correctly - numbers in parentheses like (23,355.87) should be -23355.87.
7. Strip footnote superscripts from line items (e.g., "Total Pre-Tax Fees³" → "Total Pre-Tax Fees").
8. Condense spacing (e.g., "Pre - Tax Return" → "Pre-Tax Return").
9. If a PDF only has statement details and no transactions, return an empty transactions array.
10. If a PDF only has transactions and no statement details, return an empty statementDetails array.
PROMPT;
    }
}
