<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Services\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Throwable;

class UtilityBillImportController extends Controller
{
    protected FileStorageService $fileService;

    public function __construct(FileStorageService $fileService)
    {
        $this->fileService = $fileService;
    }

    public function import(Request $request, int $accountId)
    {
        // Set execution time limit to 5 minutes to handle Gemini API requests
        set_time_limit(300);

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:pdf|max:10240', // 10MB max
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify account exists and belongs to user
        $account = UtilityAccount::findOrFail($accountId);

        $user = Auth::user();
        $apiKey = $user->getGeminiApiKey();

        if (! $apiKey) {
            return response()->json(['error' => 'Gemini API key is not set. Please set it in your account settings.'], 400);
        }

        $file = $request->file('file');
        $fileContent = $file->get();
        $prompt = $this->getPrompt($account->account_type);

        try {
            $response = Http::withOptions([
                'timeout' => 180, // 3 minutes timeout
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

            if ($response->successful()) {
                $json_string = $response->json()['candidates'][0]['content']['parts'][0]['text'];
                $data = json_decode(str_replace(['```json', '```'], '', $json_string), true);

                if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
                    // Store the PDF file in S3
                    $originalFilename = $file->getClientOriginalName();
                    $storedFilename = UtilityBill::generateStoredFilename($originalFilename);
                    $s3Path = UtilityBill::generateS3Path($accountId, $storedFilename);
                    
                    $uploaded = $this->fileService->uploadContent($fileContent, $s3Path);
                    
                    // Create the bill with extracted data
                    $billData = [
                        'utility_account_id' => $accountId,
                        'bill_start_date' => $data['bill_start_date'] ?? null,
                        'bill_end_date' => $data['bill_end_date'] ?? null,
                        'due_date' => $data['due_date'] ?? null,
                        'total_cost' => $data['total_cost'] ?? 0,
                        'taxes' => $data['taxes'] ?? null,
                        'fees' => $data['fees'] ?? null,
                        'status' => 'Unpaid',
                        'notes' => $data['notes'] ?? null,
                    ];

                    // Include electricity-specific fields if account type is Electricity
                    if ($account->account_type === 'Electricity') {
                        $billData['power_consumed_kwh'] = $data['power_consumed_kwh'] ?? null;
                        $billData['total_generation_fees'] = $data['total_generation_fees'] ?? null;
                        $billData['total_delivery_fees'] = $data['total_delivery_fees'] ?? null;
                    }

                    // Add PDF file info if upload was successful
                    if ($uploaded) {
                        $billData['pdf_original_filename'] = $originalFilename;
                        $billData['pdf_stored_filename'] = $storedFilename;
                        $billData['pdf_s3_path'] = $s3Path;
                        $billData['pdf_file_size_bytes'] = strlen($fileContent);
                    }

                    $bill = UtilityBill::create($billData);

                    Log::info('Utility bill import successful for user ID '.$user->id, [
                        'account_id' => $accountId,
                        'bill_id' => $bill->id,
                        'pdf_stored' => $uploaded,
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Bill imported successfully',
                        'bill' => $bill,
                        'extracted_data' => $data,
                    ]);
                } else {
                    Log::error('Failed to decode JSON from Gemini API for utility bill import', [
                        'response' => $response->body(),
                        'user_id' => $user->id,
                        'account_id' => $accountId,
                    ]);

                    return response()->json([
                        'error' => 'Failed to parse the extracted data from the PDF.',
                    ], 500);
                }
            } else {
                Log::error('Gemini API request failed for utility bill import', [
                    'status' => $response->status(),
                    'response' => $response->body(),
                    'user_id' => $user->id,
                    'account_id' => $accountId,
                ]);

                if ($response->status() == 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }

                return response()->json([
                    'error' => 'Failed to process the PDF with Gemini API.',
                ], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during utility bill import: '.$e->getMessage(), [
                'user_id' => $user->id,
                'account_id' => $accountId,
            ]);

            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
    }

    private function getPrompt(string $accountType): string
    {
        $basePrompt = <<<'PROMPT'
Analyze the provided utility bill PDF document and extract the following fields in JSON format.

**JSON Fields:**
- `bill_start_date`: Billing period start date (YYYY-MM-DD)
- `bill_end_date`: Billing period end date (YYYY-MM-DD)
- `due_date`: Payment due date (YYYY-MM-DD)
- `total_cost`: Total amount due (numeric, in dollars)
- `taxes`: Total taxes charged on the bill (numeric, in dollars)
- `fees`: Total fees charged on the bill, excluding taxes (numeric, in dollars)
- `notes`: Any relevant notes or account information extracted from the bill (optional, string)
PROMPT;

        if ($accountType === 'Electricity') {
            $basePrompt .= <<<'PROMPT'

**Additional Electricity-Specific Fields:**
- `power_consumed_kwh`: Total power consumed in kilowatt-hours (numeric)
- `total_generation_fees`: Total generation/supply charges (numeric, in dollars)
- `total_delivery_fees`: Total delivery/distribution charges (numeric, in dollars)

Please ensure you extract all electricity-specific metrics from the bill, including usage in kWh and the breakdown of generation vs delivery fees if available.
PROMPT;
        }

        $basePrompt .= <<<'PROMPT'

Return a single JSON object with the extracted fields. Use null for any fields that cannot be determined from the document.
PROMPT;

        return $basePrompt;
    }
}
