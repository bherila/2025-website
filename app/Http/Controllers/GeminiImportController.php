<?php

namespace App\Http\Controllers;

use App\Models\FinStatementDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class GeminiImportController extends Controller
{
    /**
     * Parse a PDF document via Gemini for transactions + statement details.
     * Returns parsed data without writing to DB. Results are cached by file hash.
     */
    public function parseDocument(Request $request)
    {
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
        $fileContent = $file->get();
        $fileHash = hash('sha256', $fileContent);

        // Check cache first
        $cacheKey = "gemini_import:transactions:{$fileHash}";
        $cached = Cache::get($cacheKey);

        if ($cached !== null) {
            return response()->json($cached);
        }

        try {
            $data = $this->callGeminiApi($apiKey, $fileContent, $this->getTransactionPrompt());

            if ($data === null) {
                return response()->json(['error' => 'Failed to parse response from AI.'], 500);
            }

            // Cache successful result for 1 hour
            Cache::put($cacheKey, $data, 3600);

            return response()->json($data);
        } catch (GeminiRateLimitException $e) {
            return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
        } catch (GeminiApiException $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        } catch (Throwable $e) {
            Log::error('Error during document parsing: '.$e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
    }

    /**
     * Parse a PDF and import statement details directly into the DB.
     * Results are cached by file hash.
     */
    public function importStatementDetails(Request $request, $statement_id)
    {
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
        $fileContent = $file->get();
        $fileHash = hash('sha256', $fileContent);

        // Check cache first
        $cacheKey = "gemini_import:statement:{$fileHash}";
        $cached = Cache::get($cacheKey);

        if ($cached !== null) {
            $statementItems = $cached;
        } else {
            try {
                $statementItems = $this->callGeminiApi($apiKey, $fileContent, $this->getStatementPrompt());

                if ($statementItems === null) {
                    return response()->json(['error' => 'Failed to parse statement data from AI response.'], 500);
                }

                // Cache successful result for 1 hour
                Cache::put($cacheKey, $statementItems, 3600);
            } catch (GeminiRateLimitException $e) {
                return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
            } catch (GeminiApiException $e) {
                return response()->json(['error' => $e->getMessage()], 500);
            } catch (Throwable $e) {
                Log::error('Error during statement import: '.$e->getMessage());

                return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
            }
        }

        // Normalize: the API might return a single object or an array of objects
        $items = isset($statementItems[0]) && is_array($statementItems[0]) ? $statementItems : [$statementItems];

        // Validate each item has required fields
        $rows = [];
        foreach ($items as $itemData) {
            if (empty($itemData['section']) && empty($itemData['line_item'])) {
                continue;
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

        DB::transaction(function () use ($rows) {
            FinStatementDetail::insert($rows);
        });

        return response()->json([
            'success' => true,
            'message' => 'Statement imported successfully.',
            'items_count' => count($rows),
        ]);
    }

    /**
     * Call the Gemini API with the given file content and prompt.
     *
     * @return array|null Parsed JSON data, or null if parsing failed
     *
     * @throws GeminiRateLimitException
     * @throws GeminiApiException
     */
    public function callGeminiApi(string $apiKey, string $fileContent, string $prompt): ?array
    {
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
                                'data' => base64_encode($fileContent),
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
            Log::error('Gemini API request failed', [
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

            if ($response->status() === 429) {
                throw new GeminiRateLimitException('API rate limit exceeded. Please wait and try again.');
            }

            throw new GeminiApiException('Failed to process the PDF file.');
        }

        $jsonText = $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $jsonText = preg_replace('/^```json\s*|\s*```$/s', '', trim($jsonText));
        $data = json_decode($jsonText, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error('Failed to decode JSON from Gemini API', [
                'response' => $jsonText,
            ]);

            return null;
        }

        // Normalize any date strings to YYYY-MM-DD (drop time/timezone)
        if (isset($data['statementInfo']) && is_array($data['statementInfo'])) {
            foreach (['periodStart', 'periodEnd'] as $key) {
                if (!empty($data['statementInfo'][$key]) && is_string($data['statementInfo'][$key])) {
                    $data['statementInfo'][$key] = substr($data['statementInfo'][$key], 0, 10);
                }
            }
        }

        if (isset($data['transactions']) && is_array($data['transactions'])) {
            foreach ($data['transactions'] as &$tx) {
                if (!empty($tx['date']) && is_string($tx['date'])) {
                    $tx['date'] = substr($tx['date'], 0, 10);
                }
            }
        }

        return $data;
    }

    public function getTransactionPrompt(): string
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

    public function getStatementPrompt(): string
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

/**
 * Custom exception for Gemini API rate limiting.
 */
class GeminiRateLimitException extends \RuntimeException {}

/**
 * Custom exception for general Gemini API errors.
 */
class GeminiApiException extends \RuntimeException {}
