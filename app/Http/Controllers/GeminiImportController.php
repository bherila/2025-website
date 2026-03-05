<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
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

        if (!$apiKey) {
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
            Log::error('Error during document parsing: ' . $e->getMessage());

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
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

        if (!$response->successful()) {
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

        // Normalize lot dates to YYYY-MM-DD
        if (isset($data['lots']) && is_array($data['lots'])) {
            foreach ($data['lots'] as &$lot) {
                foreach (['purchaseDate', 'saleDate'] as $dateKey) {
                    if (!empty($lot[$dateKey]) && is_string($lot[$dateKey])) {
                        $lot[$dateKey] = substr($lot[$dateKey], 0, 10);
                    }
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
4. Lot-level position data (open and closed lots with purchase/sale details)

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
  ],
  "lots": [
    {
      "symbol": "AAPL",
      "description": "Apple Inc.",
      "quantity": 100,
      "purchaseDate": "YYYY-MM-DD",
      "costBasis": 15000.00,
      "costPerUnit": 150.00,
      "marketValue": 17000.00,
      "unrealizedGainLoss": 2000.00,
      "saleDate": "YYYY-MM-DD",
      "proceeds": 17000.00,
      "realizedGainLoss": 2000.00
    }
  ]
}
```

**Instructions:**
1. Return ONLY valid JSON with no other text.
2. All dates should be in YYYY-MM-DD format.
3. **IMPORTANT: Only extract PARTNER-LEVEL or INVESTOR-LEVEL data.** Do NOT extract data from fund-level sections such as "Fund Level Capital Account", "Fund Level Summary", or any section that describes the overall fund rather than the individual partner/investor.
4. **Statement Details**: Extract ALL line items from PARTNER/INVESTOR-level sections with columns like "MTD" and "YTD", "Statement Period" and "YTD", or similar period-based columns. These include:
   - Statement Summary ($ and %)
   - Investor Capital Account
   - Tax and Pre-Tax Return Detail
   - Any similar partner/investor-level summary/performance sections
5. For statement details:
   - `section`: The section header (e.g., "Statement Summary ($)", "Investor Capital Account")
   - `line_item`: The row label (e.g., "Pre-Tax Return", "Total Beginning Capital")
   - `statement_period_value`: The MTD/Statement Period value as a number
   - `ytd_value`: The YTD value as a number
   - `is_percentage`: true if the values are percentages, false if currency amounts
6. **CRITICAL for consistency**: Use these exact canonical section names when they match the content:
   - "Statement Summary ($)" for dollar-value summary items
   - "Statement Summary (%)" for percentage summary items
   - "Investor Capital Account" for capital account items
   - "Tax and Pre-Tax Return Detail ($)" for dollar tax detail
   - "Tax and Pre-Tax Return Detail (%)" for percentage tax detail
   If the document uses a similar but slightly different section name (e.g. "Statement Summary (Dollars)"), map it to the canonical name above. Only create new section names for genuinely different sections not covered above.
7. **CRITICAL for consistency**: Use these exact canonical line item names when they match the content:
   - "Pre-Tax Return", "Post-Tax Return", "Net Return"
   - "Total Beginning Capital", "Total Ending Capital"
   - "Contributions", "Withdrawals", "Net Contributions/Withdrawals"
   - "Management Fee", "Incentive Allocation", "Total Fees"
   - "Realized Gain/Loss", "Unrealized Gain/Loss", "Change in Unrealized"
   If the document uses a variant (e.g. "Pre - Tax Return", "Mgt Fee"), normalize to the canonical name.
8. **Transactions**: Extract individual dated transactions (deposits, withdrawals, trades, etc.) if present.
9. **Lots**: Extract lot-level position data if present.
   - `purchaseDate`: The acquisition/investment date (may be labeled "Invt. Date", "Acquisition Date", "Purchase Date", or similar).
   - For **open lots** (positions still held with unrealized gain/loss), include `marketValue` and `unrealizedGainLoss`. Omit `saleDate`, `proceeds`, and `realizedGainLoss`.
   - For **closed lots** (sold positions with realized gain/loss), include `saleDate`, `proceeds`, and `realizedGainLoss`. Omit `marketValue` and `unrealizedGainLoss`.
10. Parse negative amounts correctly - numbers in parentheses like (23,355.87) should be -23355.87.
11. Strip footnote superscripts from line items (e.g., "Total Pre-Tax Fees³" → "Total Pre-Tax Fees").
12. Condense spacing (e.g., "Pre - Tax Return" → "Pre-Tax Return").
13. If a PDF only has statement details and no transactions, return an empty transactions array.
14. If a PDF only has transactions and no statement details, return an empty statementDetails array.
15. If a PDF has no lot data, return an empty lots array.
PROMPT;
    }
}

/**
 * Custom exception for Gemini API rate limiting.
 */
class GeminiRateLimitException extends \RuntimeException
{
}

/**
 * Custom exception for general Gemini API errors.
 */
class GeminiApiException extends \RuntimeException
{
}
