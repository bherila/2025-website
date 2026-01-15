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
            'files' => 'required|array',
            'files.*' => 'required|file|mimes:pdf|max:10240', // 10MB max per file
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

        $files = $request->file('files');
        
        // Calculate total size to prevent hitting API limits (approx 20MB limit for inline data)
        $totalSize = 0;
        foreach ($files as $file) {
            $totalSize += $file->getSize();
        }

        // Limit to 18MB to be safe with base64 overhead and prompt text
        if ($totalSize > 18 * 1024 * 1024) {
            return response()->json(['error' => 'Total file size exceeds the batch limit (18MB). Please upload fewer files.'], 422);
        }

        $prompt = $this->getPrompt($account->account_type, count($files));
        
        $parts = [];
        $parts[] = ['text' => $prompt];

        foreach ($files as $file) {
            $parts[] = ['text' => 'Filename: ' . $file->getClientOriginalName()];
            $parts[] = [
                'inline_data' => [
                    'mime_type' => 'application/pdf',
                    'data' => base64_encode($file->get()),
                ],
            ];
        }

        try {
            // Using gemini-2.0-flash-exp for better performance with multiple files if available,
            // otherwise falling back to the one in use or standard flash.
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
                if (!$candidate) {
                    throw new \Exception('No candidates returned from Gemini API');
                }
                
                $json_string = $candidate['content']['parts'][0]['text'];
                $extractedData = json_decode(str_replace(['```json', '```'], '', $json_string), true);

                if (json_last_error() === JSON_ERROR_NONE && is_array($extractedData)) {
                    $results = [];

                    // Map extracted data to files
                    // We expect the API to return an array of objects.
                    // Ideally, we match by filename if the API respected that instruction, 
                    // otherwise we map by index.
                    
                    // Create a map of filename -> extracted data for easier lookup
                    $dataMap = [];
                    foreach ($extractedData as $item) {
                        if (isset($item['original_filename'])) {
                            $dataMap[$item['original_filename']] = $item;
                        }
                    }

                    foreach ($files as $index => $file) {
                        $originalFilename = $file->getClientOriginalName();
                        
                        // Try to find data by filename, otherwise fallback to index if array length matches
                        $data = $dataMap[$originalFilename] ?? ($extractedData[$index] ?? null);

                        if ($data) {
                            try {
                                // Store the PDF file in S3
                                $storedFilename = UtilityBill::generateStoredFilename($originalFilename);
                                $s3Path = UtilityBill::generateS3Path($accountId, $storedFilename);
                                $fileContent = $file->get();
                                
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

                                if ($account->account_type === 'Electricity') {
                                    $billData['power_consumed_kwh'] = $data['power_consumed_kwh'] ?? null;
                                    $billData['total_generation_fees'] = $data['total_generation_fees'] ?? null;
                                    $billData['total_delivery_fees'] = $data['total_delivery_fees'] ?? null;
                                }

                                if ($uploaded) {
                                    $billData['pdf_original_filename'] = $originalFilename;
                                    $billData['pdf_stored_filename'] = $storedFilename;
                                    $billData['pdf_s3_path'] = $s3Path;
                                    $billData['pdf_file_size_bytes'] = $file->getSize();
                                }

                                $bill = UtilityBill::create($billData);
                                
                                $results[] = [
                                    'filename' => $originalFilename,
                                    'status' => 'success',
                                    'bill' => $bill,
                                ];
                            } catch (\Exception $e) {
                                Log::error("Failed to process file {$originalFilename}: " . $e->getMessage());
                                $results[] = [
                                    'filename' => $originalFilename,
                                    'status' => 'error',
                                    'error' => 'Failed to save bill: ' . $e->getMessage(),
                                ];
                            }
                        } else {
                            $results[] = [
                                'filename' => $originalFilename,
                                'status' => 'error',
                                'error' => 'Could not extract data for this file.',
                            ];
                        }
                    }

                    Log::info('Utility bill batch import completed for user ID '.$user->id, [
                        'account_id' => $accountId,
                        'total_files' => count($files),
                        'results' => $results,
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Batch import completed',
                        'results' => $results,
                    ]);
                } else {
                    Log::error('Failed to decode JSON from Gemini API for utility bill import', [
                        'response' => $response->body(),
                        'user_id' => $user->id,
                        'account_id' => $accountId,
                    ]);

                    return response()->json([
                        'error' => 'Failed to parse the extracted data from the response.',
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
                    'error' => 'Failed to process the files with Gemini API.',
                ], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during utility bill import: '.$e->getMessage(), [
                'user_id' => $user->id,
                'account_id' => $accountId,
            ]);

            return response()->json(['error' => 'An unexpected error occurred during import: ' . $e->getMessage()], 500);
        }
    }

    private function getPrompt(string $accountType, int $fileCount): string
    {
        $basePrompt = <<<PROMPT
Analyze the provided {$fileCount} utility bill PDF document(s).
I have provided each file preceded by "Filename: [name]".

For EACH file, extract the following fields.
Return a SINGLE JSON ARRAY containing {$fileCount} objects, one for each file.
Each object MUST include the `original_filename` to identify which file it belongs to.

**JSON Fields per object:**
- `original_filename`: The filename provided in the text preceding the file.
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

Return ONLY the JSON array.
PROMPT;

        return $basePrompt;
    }
}
