<?php

namespace App\GenAiProcessor\Jobs;

use App\GenAiProcessor\Mail\GenAiJobCompleteMail;
use App\GenAiProcessor\Mail\GenAiJobDeferredMail;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
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
            ['data' => $data, 'raw_response' => $rawResponse] = $this->callGeminiGenerateContent(
                $dispatcher,
                $job->job_type,
                $apiKey,
                $geminiFileUri,
                $job->mime_type ?? 'application/pdf',
                $prompt
            );

            if ($rawResponse !== null) {
                $job->update(['raw_response' => $rawResponse]);
            }

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
            $this->markLinkedTaxDocumentFailed($job);

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
            $this->markLinkedTaxDocumentFailed($job);

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
            $this->markLinkedTaxDocumentFailed($job);

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
     *
     * @return array{data: ?array, raw_response: ?string}
     */
    private function callGeminiGenerateContent(
        GenAiJobDispatcherService $dispatcher,
        string $jobType,
        string $apiKey,
        string $fileUri,
        string $mimeType,
        string $prompt
    ): array {
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

            return ['data' => null, 'raw_response' => $response->body()];
        }

        $body = $response->json();
        $data = $dispatcher->extractGenerateContentData($jobType, is_array($body) ? $body : []);

        if ($data === null) {
            Log::error('Failed to decode structured response from Gemini API', [
                'response' => $response->body(),
            ]);
        }

        return ['data' => $data, 'raw_response' => $response->body()];
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
            case 'tax_form_multi_account_import':
                $this->createMultiAccountTaxDocumentResults($job, $data);
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

    /**
     * If this is a tax_document job, mark the linked FileForTaxDocument as failed.
     * This is a no-op for non-tax_document job types (finance_transactions, finance_payslip, etc.)
     * since those don't have a linked document record with a genai_status column.
     *
     * Called in all failure catch blocks to prevent the document being stuck in 'pending' indefinitely.
     */
    private function markLinkedTaxDocumentFailed(GenAiImportJob $job): void
    {
        if (! in_array($job->job_type, ['tax_document', 'tax_form_multi_account_import'])) {
            return;
        }

        try {
            $context = $job->getContextArray();
            $taxDocId = $context['tax_document_id'] ?? null;
            if ($taxDocId) {
                $taxDoc = FileForTaxDocument::find($taxDocId);
                if ($taxDoc && $taxDoc->genai_job_id === $job->id) {
                    $taxDoc->update(['genai_status' => 'failed']);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('ParseImportJob: could not mark tax document as failed', [
                'job_id' => $job->id,
                'error' => $e->getMessage(),
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

    /**
     * Handle results for a tax_form_multi_account_import job.
     *
     * The AI returns a JSON array — one element per account/form pair. Each element has:
     *   account_identifier, account_name, form_type, tax_year, parsed_data
     *
     * This method:
     * 1. Stores the full array on the parent fin_tax_documents.parsed_data.
     * 2. Attempts server-side account matching (last-4 suffix, then name overlap).
     * 3. Creates one fin_tax_document_accounts row per detected account/form pair.
     *    Rows with no match have account_id = null; the user resolves them in the UI.
     */
    private function createMultiAccountTaxDocumentResults(GenAiImportJob $job, array $data): void
    {
        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($data),
            'status' => 'pending_review',
        ]);

        $context = $job->getContextArray();
        $taxDocId = $context['tax_document_id'] ?? null;
        if (! $taxDocId) {
            return;
        }

        $taxDoc = FileForTaxDocument::find($taxDocId);
        if (! $taxDoc || $taxDoc->genai_job_id !== $job->id) {
            return;
        }

        // Load all accounts for this user for matching.
        $userAccounts = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $taxDoc->user_id)
            ->get(['acct_id', 'acct_name', 'acct_number']);

        // Normalise the AI output: wrap a bare object in an array.
        $entries = isset($data[0]) ? $data : [$data];

        // Wrap lot deletion, link creation, and parent update in a transaction so a
        // mid-loop failure leaves the document in a consistent state (no partial imports).
        DB::transaction(function () use ($taxDoc, $entries, $userAccounts, $context): void {
            // Delete all existing lots linked to this document so re-processing is idempotent.
            FinAccountLot::where('tax_document_id', $taxDoc->id)->delete();

            // Also clear existing account links so re-processing replaces them cleanly.
            $taxDoc->accountLinks()->delete();

            foreach ($entries as $entry) {
                $accountId = $this->matchAccount($entry, $userAccounts);

                // Normalize form_type: validate against allowed set.
                // broker_1099 is the container type for consolidated PDFs; if the AI returns
                // an unrecognized form_type, fall back to broker_1099 but log a warning so
                // the issue is diagnosable rather than silently swallowed.
                $rawFormType = trim((string) ($entry['form_type'] ?? ''));
                if (in_array($rawFormType, FileForTaxDocument::FORM_TYPES, true)) {
                    $formType = $rawFormType;
                } else {
                    $formType = 'broker_1099';
                    \Log::warning('ParseImportJob: unrecognized form_type from AI, falling back to broker_1099', [
                        'tax_document_id' => $taxDoc->id,
                        'raw_form_type' => $rawFormType,
                    ]);
                }

                // Normalize tax_year: clamp to a sane range.
                $taxYear = (int) ($entry['tax_year'] ?? $context['tax_year'] ?? date('Y'));
                if ($taxYear < 1900 || $taxYear > 2100) {
                    $taxYear = (int) ($context['tax_year'] ?? date('Y'));
                }

                // Store the AI-detected account identifier and name directly on the join row
                // so the UI can display them without positional index correlation with parsed_data.
                $aiIdentifier = is_string($entry['account_identifier'] ?? null)
                    ? (trim($entry['account_identifier']) ?: null)
                    : null;
                $aiAccountName = is_string($entry['account_name'] ?? null)
                    ? (trim($entry['account_name']) ?: null)
                    : null;

                TaxDocumentAccount::create([
                    'tax_document_id' => $taxDoc->id,
                    'account_id' => $accountId,
                    'form_type' => $formType,
                    'tax_year' => $taxYear,
                    'ai_identifier' => $aiIdentifier,
                    'ai_account_name' => $aiAccountName,
                    'is_reviewed' => false,
                ]);

                // For 1099-B entries with a resolved account, import individual lot transactions.
                if ($formType === '1099_b' && $accountId !== null) {
                    $transactions = $entry['parsed_data']['transactions'] ?? [];
                    if (is_array($transactions) && ! empty($transactions)) {
                        $this->upsertLotsFromBroker($accountId, $transactions, $taxDoc->id);
                    }
                }
            }

            $taxDoc->update([
                'parsed_data' => $entries,
                'genai_status' => 'parsed',
            ]);
        });
    }

    /**
     * Upsert 1099-B transaction lots into fin_account_lots and fin_account_line_items.
     *
     * Lots are keyed by tax_document_id, so re-processing is idempotent:
     * existing lots for this document were deleted before this method is called.
     *
     * @param  array<array<string,mixed>>  $transactions  Normalized lot entries from the AI
     */
    private function upsertLotsFromBroker(int $accountId, array $transactions, int $taxDocumentId): void
    {
        $now = now()->toDateTimeString();

        foreach ($transactions as $tx) {
            if (! is_array($tx)) {
                continue;
            }

            $symbol = is_string($tx['symbol'] ?? null) ? trim($tx['symbol']) : null;
            $description = is_string($tx['description'] ?? null) ? trim($tx['description']) : ($symbol ?? 'Unknown');
            $quantity = is_numeric($tx['quantity'] ?? null) ? (float) $tx['quantity'] : null;
            $saleDate = $this->normalizeDateOrNull($tx['sale_date'] ?? null);
            $proceeds = is_numeric($tx['proceeds'] ?? null) ? (float) $tx['proceeds'] : null;
            $costBasis = is_numeric($tx['cost_basis'] ?? null) ? (float) $tx['cost_basis'] : null;
            $realizedGainLoss = is_numeric($tx['realized_gain_loss'] ?? null) ? (float) $tx['realized_gain_loss'] : null;
            $washSaleDisallowed = is_numeric($tx['wash_sale_disallowed'] ?? null) ? (float) $tx['wash_sale_disallowed'] : 0.0;
            $cusip = is_string($tx['cusip'] ?? null) && trim($tx['cusip']) !== '' ? trim($tx['cusip']) : null;

            $purchaseDateRaw = $tx['purchase_date'] ?? null;
            $purchaseDateNormalized = $this->normalizeDateOrNull($purchaseDateRaw);

            // Determine is_short_term from the form_8949_box or explicit field.
            $isShortTerm = null;
            if (isset($tx['is_short_term'])) {
                $isShortTerm = (bool) $tx['is_short_term'];
            } elseif (isset($tx['form_8949_box'])) {
                $box = strtoupper(trim((string) $tx['form_8949_box']));
                if (in_array($box, ['A', 'B', 'C'], true)) {
                    $isShortTerm = true;
                } elseif (in_array($box, ['D', 'E', 'F'], true)) {
                    $isShortTerm = false;
                }
            }

            // Skip rows missing required fields.
            if ($quantity === null || $saleDate === null || $proceeds === null || $costBasis === null) {
                continue;
            }

            // Insert the closed lot.
            $lot = FinAccountLot::create([
                'acct_id' => $accountId,
                'symbol' => $symbol ?? $description,
                'description' => $description,
                'quantity' => $quantity,
                'purchase_date' => $purchaseDateNormalized ?? $saleDate, // fallback to sale date if "various"
                'cost_basis' => $costBasis,
                'cost_per_unit' => $quantity > 0 ? round($costBasis / $quantity, 8) : null,
                'sale_date' => $saleDate,
                'proceeds' => $proceeds,
                'realized_gain_loss' => $realizedGainLoss ?? ($proceeds - $costBasis + $washSaleDisallowed),
                'is_short_term' => $isShortTerm,
                'lot_source' => '1099b',
                'tax_document_id' => $taxDocumentId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // Create a matching sell line item in fin_account_line_items.
            // Only create if no matching sell transaction already exists (by date/symbol/qty/amount).
            $existingSell = FinAccountLineItems::where('t_account', $accountId)
                ->where('t_date', $saleDate)
                ->where('t_symbol', $symbol ?? $description)
                ->where('t_qty', -abs($quantity))
                ->where('t_amt', -abs($proceeds))
                ->exists();

            if (! $existingSell) {
                $sellItem = FinAccountLineItems::create([
                    't_account' => $accountId,
                    't_date' => $saleDate,
                    't_type' => 'Sell',
                    't_description' => $description,
                    't_symbol' => $symbol ?? $description,
                    't_cusip' => $cusip,
                    't_qty' => -abs($quantity),
                    't_price' => $quantity > 0 ? round($proceeds / $quantity, 6) : null,
                    't_amt' => -abs($proceeds),
                    't_basis' => $costBasis,
                    't_realized_pl' => $realizedGainLoss ?? ($proceeds - $costBasis + $washSaleDisallowed),
                    't_source' => '1099b',
                ]);

                // Link the lot to the sell transaction.
                $lot->update(['close_t_id' => $sellItem->t_id]);
            }
        }
    }

    /**
     * Parse a date string to "YYYY-MM-DD" or null.
     * Returns null for "various", empty strings, or unparseable values.
     */
    private function normalizeDateOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || strtolower($trimmed) === 'various') {
            return null;
        }

        // Already in YYYY-MM-DD
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
            return $trimmed;
        }

        // Try PHP date parsing for common formats (MM/DD/YYYY, M/D/YY, etc.)
        try {
            $date = new \DateTime($trimmed);

            return $date->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Try to match an AI-detected account entry to a fin_accounts row.
     *
     * Matching strategy (mirrors accountMatcher.ts):
     * 1. Exact match on acct_number.
     * 2. Last-4 suffix match; if unique → return it.
     * 3. Name word-overlap disambiguation among last-4 candidates.
     * 4. Returns null if no confident match.
     *
     * @param  array<string,mixed>  $entry
     */
    private function matchAccount(array $entry, Collection $accounts): ?int
    {
        $identifier = trim((string) ($entry['account_identifier'] ?? ''));
        $aiName = strtolower(trim((string) ($entry['account_name'] ?? '')));

        if ($identifier === '') {
            return null;
        }

        // 1. Exact match on stored account number.
        foreach ($accounts as $acct) {
            if ($acct->acct_number && $acct->acct_number === $identifier) {
                return $acct->acct_id;
            }
        }

        // 2. Last-4 suffix match.
        $last4 = preg_replace('/\D/', '', $identifier);
        $last4 = $last4 !== '' ? substr($last4, -4) : '';

        $candidates = $last4 !== ''
            ? $accounts->filter(function ($acct) use ($last4): bool {
                $stored = preg_replace('/\D/', '', (string) ($acct->acct_number ?? ''));

                return $stored !== '' && str_ends_with($stored, $last4);
            })
            : collect();

        if ($candidates->count() === 1) {
            return $candidates->first()->acct_id;
        }

        // 3. Name word-overlap disambiguation among last-4 candidates (or all if no last4).
        $pool = $candidates->isNotEmpty() ? $candidates : $accounts;

        if ($aiName === '') {
            return null;
        }

        $aiWords = array_filter(preg_split('/\s+/', $aiName) ?: []);
        $bestScore = 0;
        $bestId = null;

        foreach ($pool as $acct) {
            $acctWords = array_filter(preg_split('/\s+/', strtolower($acct->acct_name)) ?: []);
            $overlap = count(array_intersect($aiWords, $acctWords));
            if ($overlap > $bestScore) {
                $bestScore = $overlap;
                $bestId = $acct->acct_id;
            }
        }

        return $bestScore > 0 ? $bestId : null;
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
