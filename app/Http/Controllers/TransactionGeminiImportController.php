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
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:pdf|max:10240', // 10MB max
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
        $prompt = $this->getPrompt();

        try {
            $response = Http::withHeaders([
                'x-goog-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ])->withOptions([
                'timeout' => 120, // 2 minutes timeout
            ])->post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', [
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
                    'response_mime_type' => 'text/plain',
                ],
            ]);

            if ($response->successful()) {
                $csv_data = $response->json()['candidates'][0]['content']['parts'][0]['text'];
                return response($csv_data, 200, ['Content-Type' => 'text/csv']);
            } else {
                Log::error('Gemini API request failed for file: ' . $file->getClientOriginalName(), [
                    'status' => $response->status(),
                    'response' => $response->body(),
                ]);
                if ($response->status() == 429) {
                    return response()->json(['error' => 'API rate limit exceeded. Please wait and try again.'], 429);
                }
                return response()->json(['error' => 'Failed to process the PDF file.'], 500);
            }
        } catch (Throwable $e) {
            Log::error('Error during transaction import: ' . $e->getMessage());
            return response()->json(['error' => 'An unexpected error occurred during import.'], 500);
        }
    }

    private function getPrompt()
    {
        return <<<PROMPT
Analyze the provided bank statement PDF and extract all transactions.
Return the data as a CSV with the following headers: date, time, description, amount, type.

**Instructions:**
1.  The output must be only CSV data.
2.  Do not include any other text or explanations.
3.  The date format should be YYYY-MM-DD.
4.  The time format should be HH:MM:SS. If the time is not available, use 00:00:00.
5.  The amount should be a number. Positive for deposits, negative for withdrawals.
6.  The description should be a short text describing the transaction.
7.  The 'type' column should be one of: 'deposit', 'withdrawal', 'transfer', or other short description of the transaction type.

**Example Output:**
date,time,description,amount,type
2025-01-01,10:00:00,DEPOSIT,1000.00,deposit
2025-01-02,14:30:00,GROCERY STORE,-75.50,withdrawal
2025-01-03,00:00:00,ONLINE PAYMENT,-25.00,withdrawal
PROMPT;
    }
}
