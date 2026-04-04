<?php

namespace App\GenAiProcessor\Jobs;

use App\GenAiProcessor\Mail\GenAiJobCompleteMail;
use App\GenAiProcessor\Mail\GenAiJobDeferredMail;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\Files\FileForTaxDocument;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class ParseImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The maximum number of seconds the job can run before timing out.
     */
    public int $timeout = 300;

    /**
     * The number of times the job may be attempted.
     * Retries are user-initiated via API, not automatic.
     */
    public int $tries = 1;

    public function __construct(
        public int $jobId
    ) {
        $this->onQueue('genai-imports');
    }

    public function handle(GenAiJobDispatcherService $dispatcher): void
    {
        $job = GenAiImportJob::find($this->jobId);

        if (! $job || $job->status !== 'pending') {
            Log::info('ParseImportJob: skipping stale dispatch', ['job_id' => $this->jobId]);

            return;
        }

        $user = $job->user;
        if (! $user) {
            $job->markFailed('User not found');

            return;
        }

        $apiKey = $user->getGeminiApiKey();
        if (! $apiKey) {
            $job->markFailed('Gemini API key is not set.');

            return;
        }

        $geminiFileUri = null;

        try {
            // Stream file from S3 to avoid buffering large uploads fully into memory
            $fileStream = Storage::disk('s3')->readStream($job->s3_path);
            if (! $fileStream) {
                $job->markFailed('File not found in S3');

                return;
            }

            // Upload to Gemini File API using stream
            try {
                $geminiFileUri = $this->uploadToGeminiFileApi($apiKey, $fileStream, $job->mime_type ?? 'application/pdf');
            } finally {
                if (is_resource($fileStream)) {
                    fclose($fileStream);
                }
            }

            if (! $geminiFileUri) {
                $job->markFailed('Failed to upload file to Gemini File API');

                return;
            }

            // Build prompt
            $context = $job->getContextArray();
            $prompt = $dispatcher->buildPrompt($job->job_type, $context);

            // Claim quota right before the Gemini API call to avoid double-counting
            if (! $dispatcher->claimQuota($user->id, $user)) {
                $job->markQueuedTomorrow();
                Log::info('ParseImportJob: quota exhausted, deferred', ['job_id' => $job->id]);

                // Notify user their job has been deferred
                try {
                    Mail::to($user->email)->send(new GenAiJobDeferredMail($job));
                } catch (\Throwable $mailEx) {
                    Log::warning('Failed to send deferred mail', ['job_id' => $job->id, 'error' => $mailEx->getMessage()]);
                }

                return;
            }

            $job->markProcessing();

            // Call generateContent with file_uri
            $data = $this->callGeminiGenerateContent(
                $dispatcher,
                $job->job_type,
                $apiKey,
                $geminiFileUri,
                $job->mime_type ?? 'application/pdf',
                $prompt
            );

            if ($data === null) {
                $job->markFailed('Failed to parse response from AI.');

                return;
            }

            // Create result rows based on job type
            $this->createResults($job, $data);

            $job->markParsed();

            Log::info('ParseImportJob: success', [
                'job_id' => $job->id,
                'result_count' => $job->results()->count(),
            ]);

            // Notify user their import is ready for review
            try {
                Mail::to($user->email)->send(new GenAiJobCompleteMail($job));
            } catch (\Throwable $mailEx) {
                Log::warning('Failed to send completion mail', ['job_id' => $job->id, 'error' => $mailEx->getMessage()]);
            }
        } catch (GeminiRateLimitException $e) {
            $job->markFailed('API rate limit exceeded. Please wait and try again.');

            try {
                Mail::to($user->email)->send(new GenAiJobCompleteMail($job));
            } catch (\Throwable $mailEx) {
                Log::warning('Failed to send failure mail', ['job_id' => $job->id]);
            }
        } catch (GeminiFatalException $e) {
            // Fatal errors (400 Bad Request, etc.) - mark as failed immediately with max retries
            $job->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'retry_count' => GenAiImportJob::MAX_RETRIES,
            ]);

            try {
                Mail::to($user->email)->send(new GenAiJobCompleteMail($job));
            } catch (\Throwable $mailEx) {
                Log::warning('Failed to send failure mail', ['job_id' => $job->id]);
            }
        } catch (\Throwable $e) {
            Log::error('ParseImportJob: unexpected error', [
                'job_id' => $job->id,
                'error' => $e->getMessage(),
            ]);
            $job->markFailed('An unexpected error occurred: '.$e->getMessage());

            try {
                Mail::to($user->email)->send(new GenAiJobCompleteMail($job));
            } catch (\Throwable $mailEx) {
                Log::warning('Failed to send failure mail', ['job_id' => $job->id]);
            }
        } finally {
            // Always try to clean up Gemini file
            if ($geminiFileUri) {
                $this->deleteFromGeminiFileApi($apiKey, $geminiFileUri);
            }
        }
    }

    /**
     * Upload a file stream to the Gemini File API.
     * Returns the file URI (e.g., "files/abc123") or null on failure.
     *
     * @param  resource  $fileStream
     */
    private function uploadToGeminiFileApi(string $apiKey, $fileStream, string $mimeType): ?string
    {
        // Pass the stream resource directly to Guzzle's multipart builder.
        // Guzzle accepts a PHP resource for streaming uploads, avoiding full in-memory buffering.
        $response = Http::withHeaders([
            'x-goog-api-key' => $apiKey,
        ])->attach(
            'file', $fileStream, 'upload.pdf', ['Content-Type' => $mimeType]
        )->post('https://generativelanguage.googleapis.com/upload/v1beta/files', [
            'file' => ['display_name' => 'genai-import-'.time()],
        ]);

        if (! $response->successful()) {
            Log::error('Gemini File API upload failed', [
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

            if ($response->status() === 400) {
                throw new GeminiFatalException('File rejected by Gemini: '.$response->body());
            }

            return null;
        }

        return $response->json('file.uri') ?? $response->json('file.name');
    }

    /**
     * Call Gemini generateContent with a file_uri reference.
     */
    private function callGeminiGenerateContent(
        GenAiJobDispatcherService $dispatcher,
        string $jobType,
        string $apiKey,
        string $fileUri,
        string $mimeType,
        string $prompt
    ): ?array {
        $response = Http::withHeaders([
            'x-goog-api-key' => $apiKey,
            'Content-Type' => 'application/json',
        ])->withOptions([
            'timeout' => 240,
        ])->post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
            $dispatcher->buildGenerateContentPayload($jobType, $fileUri, $mimeType, $prompt)
        );

        if (! $response->successful()) {
            Log::error('Gemini generateContent failed', [
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

            if ($response->status() === 429) {
                throw new GeminiRateLimitException('API rate limit exceeded.');
            }

            if ($response->status() === 400) {
                throw new GeminiFatalException('Bad request: '.$response->body());
            }

            return null;
        }

        $body = $response->json();
        $data = $dispatcher->extractGenerateContentData($jobType, is_array($body) ? $body : []);

        if ($data === null) {
            Log::error('Failed to decode structured response from Gemini API', [
                'response' => $response->body(),
            ]);
        }

        return $data;
    }

    /**
     * Delete a file from the Gemini File API to free quota.
     */
    private function deleteFromGeminiFileApi(string $apiKey, string $fileUri): void
    {
        try {
            // The fileUri might be "files/abc123" or a full URL. Extract the name part.
            $fileName = $fileUri;
            if (! str_starts_with($fileName, 'files/')) {
                // Try to extract from URI
                if (preg_match('/files\/[a-zA-Z0-9_-]+/', $fileUri, $matches)) {
                    $fileName = $matches[0];
                }
            }

            Http::withHeaders([
                'x-goog-api-key' => $apiKey,
            ])->delete("https://generativelanguage.googleapis.com/v1beta/{$fileName}");
        } catch (\Throwable $e) {
            Log::warning('Failed to delete Gemini file', [
                'file_uri' => $fileUri,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Create GenAiImportResult rows from parsed data.
     */
    private function createResults(GenAiImportJob $job, array $data): void
    {
        switch ($job->job_type) {
            case 'finance_transactions':
                $this->createFinanceResults($job, $data);
                break;
            case 'finance_payslip':
                $this->createPayslipResults($job, $data);
                break;
            case 'utility_bill':
                $this->createUtilityBillResults($job, $data);
                break;
            case 'tax_document':
                $this->createTaxDocumentResults($job, $data);
                break;
        }
    }

    private function createFinanceResults(GenAiImportJob $job, array $data): void
    {
        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($data),
            'status' => 'pending_review',
        ]);
    }

    private function createPayslipResults(GenAiImportJob $job, array $data): void
    {
        // The API returns an array of payslip objects
        $payslips = isset($data[0]) ? $data : [$data];

        foreach ($payslips as $index => $payslip) {
            GenAiImportResult::create([
                'job_id' => $job->id,
                'result_index' => $index,
                'result_json' => json_encode($payslip),
                'status' => 'pending_review',
            ]);
        }
    }

    private function createUtilityBillResults(GenAiImportJob $job, array $data): void
    {
        // The API returns an array of bill objects
        $bills = isset($data[0]) ? $data : [$data];

        foreach ($bills as $index => $bill) {
            GenAiImportResult::create([
                'job_id' => $job->id,
                'result_index' => $index,
                'result_json' => json_encode($bill),
                'status' => 'pending_review',
            ]);
        }
    }

    private function createTaxDocumentResults(GenAiImportJob $job, array $data): void
    {
        // Store the result in genai_import_results
        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($data),
            'status' => 'pending_review',
        ]);

        // Update the linked FileForTaxDocument with parsed data
        $context = $job->getContextArray();
        $taxDocId = $context['tax_document_id'] ?? null;
        if ($taxDocId) {
            $taxDoc = FileForTaxDocument::find($taxDocId);
            if ($taxDoc && $taxDoc->genai_job_id === $job->id) {
                $taxDoc->update([
                    'parsed_data' => $data,
                    'genai_status' => 'parsed',
                ]);
            }
        }
    }
}

/**
 * Thrown on transient rate-limit errors (429).
 */
class GeminiRateLimitException extends \RuntimeException {}

/**
 * Thrown on fatal errors where retrying would be pointless (400, corrupt file, etc.).
 */
class GeminiFatalException extends \RuntimeException {}
