<?php

namespace App\Http\Controllers;

use App\Models\FinStatementDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class StatementImportGeminiController extends Controller
{
    public function import(Request $request, $statement_id)
    {
        // Set execution time limit to 5 minutes to handle multiple API requests
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:10240', // 10MB max
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
            $response = Http::timeout(300)->withHeaders([
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

            if ($response->successful()) {
                $json_string = $response->json()['candidates'][0]['content']['parts'][0]['text'];
                $data = json_decode(str_replace(['```json', '```'], '', $json_string), true);

                if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                    // The Gemini API might return a single object or an array of objects
                    $statementItems = isset($data[0]) && is_array($data[0]) ? $data : [$data];

                    foreach ($statementItems as $itemData) {
                        $itemData['statement_id'] = $statement_id;

                        // Set defaults for required fields if missing
                        $itemData['statement_period_value'] = $itemData['statement_period_value'] ?? 0;
                        $itemData['ytd_value'] = $itemData['ytd_value'] ?? 0;
                        $itemData['is_percentage'] = $itemData['is_percentage'] ?? false;

                        FinStatementDetail::create($itemData);
                    }
                } else {
                    Log::error('Failed to decode JSON from Gemini API for file: '.$file->getClientOriginalName(), [
                        'response' => $response->body(),
                    ]);

                    return response()->json(['error' => 'Failed to parse statement data.'], 500);
                }
            } else {
                Log::error('Gemini API request failed for file: '.$file->getClientOriginalName(), [
                    'status' => $response->status(),
                    'response' => $response->body(),
                ]);
                if ($response->status() == 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }

                return response()->json(['error' => 'Failed to import statement data.'], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during statement import: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Statement imported successfully.',
        ]);
    }

    private function getPrompt()
    {
        return <<<'PROMPT'
Analyze the provided financial statement PDF document and extract the line items from each section. Return the data as a JSON array of objects.

**JSON Fields:**
- `section`: The name of the section (e.g., "Statement Summary ($)", "Statement Summary (%)", "Investor Capital Account").
- `line_item`: The name of the line item (e.g., "Pre - Tax Return", "Total Beginning Capital").
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
    "line_item": "Pre - Tax Return",
    "statement_period_value": -23355.87,
    "ytd_value": 12312.59,
    "is_percentage": false
  },
  {
    "section": "Statement Summary (%)",
    "line_item": "Pre - Tax Return",
    "statement_period_value": -1.75,
    "ytd_value": 1.76,
    "is_percentage": true
  }
]
```
PROMPT;
    }
}
