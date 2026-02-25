<?php

namespace App\Http\Controllers;

use App\Models\FinStatementDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class StatementImportGeminiController extends Controller
{
    public function import(Request $request, $statement_id)
    {
        // Set execution time limit to 5 minutes to handle Gemini API latency
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:10240', // 10MB max
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify the statement exists and belongs to the authenticated user
        $user = Auth::user();
        $statement = DB::table('fin_statements')
            ->join('fin_accounts', 'fin_statements.acct_id', '=', 'fin_accounts.acct_id')
            ->where('fin_statements.statement_id', $statement_id)
            ->where('fin_accounts.acct_owner', $user->id)
            ->select('fin_statements.statement_id')
            ->first();

        if (! $statement) {
            return response()->json(['error' => 'Statement not found or access denied.'], 404);
        }

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

            if (! $response->successful()) {
                Log::error('Gemini API request failed for file: '.$file->getClientOriginalName(), [
                    'status' => $response->status(),
                    'response' => $response->body(),
                ]);

                if ($response->status() === 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }

                return response()->json(['error' => 'Failed to import statement data.'], 500);
            }

            $jsonText = $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? '';
            // Strip markdown code fences if present
            $jsonText = preg_replace('/^```json\s*|\s*```$/s', '', trim($jsonText));
            $data = json_decode($jsonText, true);

            if (json_last_error() !== JSON_ERROR_NONE || ! is_array($data)) {
                Log::error('Failed to decode JSON from Gemini API for file: '.$file->getClientOriginalName(), [
                    'response' => $jsonText,
                ]);

                return response()->json(['error' => 'Failed to parse statement data from AI response.'], 500);
            }

            // Normalize: the API might return a single object or an array of objects
            $statementItems = isset($data[0]) && is_array($data[0]) ? $data : [$data];

            // Validate each item has required fields
            $rows = [];
            foreach ($statementItems as $itemData) {
                if (empty($itemData['section']) && empty($itemData['line_item'])) {
                    continue; // Skip malformed entries
                }

                $rows[] = [
                    'statement_id' => $statement_id,
                    'section' => $itemData['section'] ?? '',
                    'line_item' => $itemData['line_item'] ?? '',
                    'statement_period_value' => $itemData['statement_period_value'] ?? 0,
                    'ytd_value' => $itemData['ytd_value'] ?? 0,
                    'is_percentage' => $itemData['is_percentage'] ?? false,
                ];
            }

            if (empty($rows)) {
                return response()->json(['error' => 'No valid statement items found in the PDF.'], 422);
            }

            // Batch insert within a transaction for atomicity
            DB::transaction(function () use ($rows) {
                FinStatementDetail::insert($rows);
            });

            return response()->json([
                'success' => true,
                'message' => 'Statement imported successfully.',
                'items_count' => count($rows),
            ]);

        } catch (Throwable $e) {
            Log::error('Error during statement import: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
    }

    public function getPrompt(): string
    {
        return <<<'PROMPT'
Analyze the provided financial statement PDF document and extract the line items from each section. Return the data as a JSON array of objects.

**JSON Fields:**
- `section`: The name of the section (e.g., "Statement Summary ($)", "Statement Summary (%)", "Investor Capital Account").
- `line_item`: The name of the line item (e.g., "Pre-Tax Return", "Total Beginning Capital").
- `statement_period_value`: The value for the current statement period (MTD or similar). This may be a currency value or a percentage.
- `ytd_value`: The year-to-date value. This may be a currency value or a percentage.
- `is_percentage`: A boolean value (`true` or `false`) indicating if the values for this line item are percentages.

**Instructions:**
1.  Return the data in a clean JSON array format. Do not include any explanatory text outside of the JSON structure.
2.  If a field is not present in the document for a given line item, omit it from the JSON or set its value to `null`.
3.  All monetary values should be numbers (e.g., `1234.56`). Negative numbers may be represented with parentheses, so parse them correctly (e.g., `(23,355.87)` should be `-23355.87`).
4.  Percentage values should be returned as numbers (e.g., `1.76%` should be `1.76`).
5.  The `is_percentage` flag should be `true` if the line item's values are percentages, and `false` otherwise.
6.  Strip out any superscript footnotes in any fields; for example "Total Pre-Tax Fees³" should be parsed as "Total Pre-Tax Fees" and the "³" is discarded; "Tax Benefit from Fees4" is parsed as "Tax Benefit from Fees" and the "4" is discarded.
7.  Condense spacing i.e. "Pre - Tax Return" should be parsed as "Pre-Tax Return".

Example Output:
```json
[
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
]
```
PROMPT;
    }
}
