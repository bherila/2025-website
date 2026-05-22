<?php

namespace App\GenAiProcessor\Jobs;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\GenAiProcessor\Mail\GenAiJobCompleteMail;
use App\GenAiProcessor\Mail\GenAiJobDeferredMail;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use App\GenAiProcessor\Support\GenAiCredentialErrorClassifier;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotImportFromParsedDataService;
use App\Services\Finance\DocumentIngestionService;
use App\Services\GenAiFileHelper;
use App\Services\PHR\Import\PhrStructuredDataImporter;
use Bherila\GenAiLaravel\ContentBlock;
use Bherila\GenAiLaravel\Contracts\GenAiClient;
use Bherila\GenAiLaravel\Exceptions\GenAiFatalException;
use Bherila\GenAiLaravel\Exceptions\GenAiRateLimitException;
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
use Illuminate\Support\Str;

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

        $activeConfig = $user->activeAiConfiguration();
        if ($activeConfig && $activeConfig->isExpired()) {
            $job->markFailed('Your AI configuration "'.$activeConfig->name.'" has expired. Please update it in Settings.');

            return;
        }
        if ($activeConfig && $activeConfig->hasInvalidApiKey()) {
            $job->markFailed('Your AI configuration "'.$activeConfig->name.'" has an invalid API key. Please update it in Settings.');

            return;
        }

        $client = $user->resolvedAiClient();
        if (! $client) {
            $job->markFailed('No AI configuration found. Please add one in Settings.');

            return;
        }

        $fileStream = null;
        $textOnlyJob = $job->job_type === 'class_action_email';
        try {
            $context = $job->getContextArray();

            if ($textOnlyJob) {
                // Pasted-text jobs (class_action_email) are sent as plain text in the prompt —
                // no document/file attachment, because Anthropic's inline document blocks only
                // accept application/pdf (text/plain is rejected as invalid_request_error).
                $pastedText = trim((string) ($context['pasted_text'] ?? ''));
                if ($pastedText === '') {
                    $job->markFailed('Pasted input text is empty.');

                    return;
                }
            } else {
                // Stream file from S3 to avoid buffering large uploads fully into memory
                $fileStream = Storage::disk('s3')->readStream($job->s3_path);
                if (! $fileStream) {
                    $job->markFailed('File not found in S3');

                    return;
                }

                $fileSize = (int) (Storage::disk('s3')->size($job->s3_path) ?: 0);

                // Guard against oversized inline-fallback payloads for providers without a File API.
                if ($fileSize > 0 && ! GenAiFileHelper::withinSizeLimit($client, $fileSize)) {
                    $job->markFailed('File exceeds the size limit for the configured AI provider.');

                    return;
                }
            }

            // Build prompt
            $prompt = $dispatcher->buildPrompt($job->job_type, $context);

            // Claim quota right before the AI call to avoid double-counting
            if (! $dispatcher->claimQuota($user->id, $user)) {
                $job->markQueuedTomorrow();
                Log::info('ParseImportJob: quota exhausted, deferred', ['job_id' => $job->id]);

                try {
                    Mail::to($user->email)->send(new GenAiJobDeferredMail($job));
                } catch (\Throwable $mailEx) {
                    Log::warning('Failed to send deferred mail', ['job_id' => $job->id, 'error' => $mailEx->getMessage()]);
                }

                return;
            }

            $job->update([
                'status' => 'processing',
                'ai_configuration_id' => $activeConfig?->id,
                'ai_provider' => $client->provider(),
                'ai_model' => $client->model(),
            ]);

            ['data' => $data, 'raw_response' => $rawResponse, 'input_tokens' => $inputTokens, 'output_tokens' => $outputTokens, 'parse_error' => $parseError] = $textOnlyJob
                ? $this->callGenerateContentTextOnly(
                    $client,
                    $dispatcher,
                    $job->job_type,
                    $prompt,
                )
                : $this->callGenerateContent(
                    $client,
                    $dispatcher,
                    $job->job_type,
                    $fileStream,
                    $job->mime_type ?? 'application/pdf',
                    $prompt,
                );

            $jobUpdates = [];
            if ($rawResponse !== null) {
                $jobUpdates['raw_response'] = $rawResponse;
            }
            if ($inputTokens !== null) {
                $jobUpdates['input_tokens'] = $inputTokens;
            }
            if ($outputTokens !== null) {
                $jobUpdates['output_tokens'] = $outputTokens;
            }
            if (! empty($jobUpdates)) {
                $job->update($jobUpdates);
            }

            if ($data === null) {
                $job->markFailed($parseError ?? 'Failed to parse response from AI.');

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
        } catch (GenAiRateLimitException $e) {
            $job->markFailed('API rate limit exceeded. Please wait and try again.');
            $this->markLinkedTaxDocumentFailed($job);

            try {
                Mail::to($user->email)->send(new GenAiJobCompleteMail($job));
            } catch (\Throwable $mailEx) {
                Log::warning('Failed to send failure mail', ['job_id' => $job->id]);
            }
        } catch (GenAiFatalException $e) {
            if ($activeConfig && GenAiCredentialErrorClassifier::isInvalidCredential($activeConfig->provider, $e)) {
                $activeConfig->markApiKeyInvalid($e->getMessage());
            }

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
            if (is_resource($fileStream)) {
                fclose($fileStream);
            }
        }
    }

    /**
     * Send a file to the AI provider and extract structured data.
     * Uses GenAiFileHelper to handle File API vs inline fallback transparently.
     *
     * @param  resource  $fileStream
     * @return array{data: array<string, mixed>|null, raw_response: string|null, input_tokens: int|null, output_tokens: int|null, parse_error: string|null}
     */
    private function callGenerateContent(
        GenAiClient $client,
        GenAiJobDispatcherService $dispatcher,
        string $jobType,
        mixed $fileStream,
        string $mimeType,
        string $prompt
    ): array {
        $toolConfig = $dispatcher->buildToolConfig($jobType, $prompt);
        $response = GenAiFileHelper::send(
            $client,
            $fileStream,
            $mimeType,
            'genai-import-'.time(),
            $prompt,
            $toolConfig ?: null,
            $dispatcher->assistantPrefillForJobType($jobType, $client),
        );
        $rawResponse = json_encode($response);

        $data = $dispatcher->extractGenerateContentData($jobType, $response, $client);
        $parseError = null;

        if ($data === null) {
            $parseError = $dispatcher->describeResponseExtractionFailure(is_array($response) ? $response : [], $client);
            Log::error('Failed to decode structured response from AI provider', [
                'response' => $rawResponse,
                'parse_error' => $parseError,
            ]);
        }

        [$inputTokens, $outputTokens] = $this->extractTokenUsage(is_array($response) ? $response : []);

        return ['data' => $data, 'raw_response' => $rawResponse, 'input_tokens' => $inputTokens, 'output_tokens' => $outputTokens, 'parse_error' => $parseError];
    }

    /**
     * Send a text-only prompt to the AI provider (no file/document attachment) and extract
     * structured data. Used by job types whose entire input is embedded in the prompt — e.g.
     * class_action_email, whose pasted email body is interpolated by the prompt template.
     *
     * @return array{data: array<string, mixed>|null, raw_response: string|null, input_tokens: int|null, output_tokens: int|null, parse_error: string|null}
     */
    private function callGenerateContentTextOnly(
        GenAiClient $client,
        GenAiJobDispatcherService $dispatcher,
        string $jobType,
        string $prompt,
    ): array {
        $toolConfig = $dispatcher->buildToolConfig($jobType, $prompt);

        $response = $client->converse('', [
            [
                'role' => 'user',
                'content' => [ContentBlock::text($prompt)],
            ],
        ], $toolConfig ?: null);

        $rawResponse = json_encode($response);

        $data = $dispatcher->extractGenerateContentData($jobType, $response, $client);
        $parseError = null;

        if ($data === null) {
            $parseError = $dispatcher->describeResponseExtractionFailure(is_array($response) ? $response : [], $client);
            Log::error('Failed to decode structured response from AI provider', [
                'response' => $rawResponse,
                'parse_error' => $parseError,
            ]);
        }

        [$inputTokens, $outputTokens] = $this->extractTokenUsage(is_array($response) ? $response : []);

        return ['data' => $data, 'raw_response' => $rawResponse, 'input_tokens' => $inputTokens, 'output_tokens' => $outputTokens, 'parse_error' => $parseError];
    }

    /**
     * Extract token usage counts from a provider response using shape-based detection.
     * Gemini uses `usageMetadata`; Anthropic uses snake_case `usage`; Bedrock uses camelCase `usage`.
     *
     * @param  array<string, mixed>  $response
     * @return array{int|null, int|null}
     */
    public function extractTokenUsage(array $response): array
    {
        $usageMetadata = $response['usageMetadata'] ?? null;
        if (is_array($usageMetadata)) {
            return [
                isset($usageMetadata['promptTokenCount']) ? (int) $usageMetadata['promptTokenCount'] : null,
                isset($usageMetadata['candidatesTokenCount']) ? (int) $usageMetadata['candidatesTokenCount'] : null,
            ];
        }

        $usage = $response['usage'] ?? null;
        if (is_array($usage)) {
            $input = null;
            $output = null;
            if (isset($usage['input_tokens'])) {
                $input = (int) $usage['input_tokens'];
            } elseif (isset($usage['inputTokens'])) {
                $input = (int) $usage['inputTokens'];
            }
            if (isset($usage['output_tokens'])) {
                $output = (int) $usage['output_tokens'];
            } elseif (isset($usage['outputTokens'])) {
                $output = (int) $usage['outputTokens'];
            }

            return [$input, $output];
        }

        return [null, null];
    }

    /**
     * Create GenAiImportResult rows from parsed data.
     *
     * @param  array<string, mixed>  $data
     */
    private function createResults(GenAiImportJob $job, array $data): void
    {
        switch ($job->job_type) {
            case 'finance_transactions':
                $this->createFinanceResults($job, $data);
                break;
            case 'class_action_email':
                $this->createClassActionEmailResults($job, $data);
                break;
            case 'finance_payslip':
                $this->createPayslipResults($job, $data);
                break;
            case 'utility_bill':
                $this->createUtilityBillResults($job, $data);
                break;
            case 'document_extract':
                $this->createDocumentResults($job, $data);
                break;
            default:
                if (PhrStructuredDataImporter::isPhrJobType($job->job_type)) {
                    $this->createPhrResults($job, $data);
                }
                break;
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createFinanceResults(GenAiImportJob $job, array $data): void
    {
        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($data),
            'status' => 'pending_review',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
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

    /**
     * @param  array<string, mixed>  $data
     */
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
     * @param  array<string, mixed>  $data
     */
    private function createClassActionEmailResults(GenAiImportJob $job, array $data): void
    {
        $result = $this->sanitizeClassActionEmailResult($data);

        $classActionUrl = is_string($result['class_action_url'] ?? null)
            ? trim((string) $result['class_action_url'])
            : '';

        if ($classActionUrl !== '') {
            $referenceText = $this->fetchAllowedClassActionReferenceText($classActionUrl);
            if ($referenceText !== null) {
                $result['reference_page_text'] = $referenceText;
            }
        }

        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($result),
            'status' => 'pending_review',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function sanitizeClassActionEmailResult(array $data): array
    {
        $result = [
            'name' => $this->sanitizeString($data['name'] ?? null, 255),
            'claim_id' => $this->sanitizeString($data['claim_id'] ?? null, 128),
            'pin' => $this->sanitizeString($data['pin'] ?? null, 128),
            'administrator' => $this->sanitizeString($data['administrator'] ?? null, 255),
            'defendant' => $this->sanitizeString($data['defendant'] ?? null, 255),
            'class_action_url' => $this->sanitizeUrl($data['class_action_url'] ?? null),
            'notification_received_on' => $this->sanitizeDate($data['notification_received_on'] ?? null),
            'claim_submitted_on' => $this->sanitizeDate($data['claim_submitted_on'] ?? null),
            'claim_deadline' => $this->sanitizeDate($data['claim_deadline'] ?? null),
            'final_approval_hearing_on' => $this->sanitizeDate($data['final_approval_hearing_on'] ?? null),
            'payment_election_submitted_on' => $this->sanitizeDate($data['payment_election_submitted_on'] ?? null),
            'expected_payment_on' => $this->sanitizeDate($data['expected_payment_on'] ?? null),
            'expected_payment_amount' => $this->sanitizeMoney($data['expected_payment_amount'] ?? null),
            'confidence' => $this->sanitizeConfidence($data['confidence'] ?? null),
            'notes' => $this->sanitizeString($data['notes'] ?? null, 5000),
        ];

        return $result;
    }

    private function sanitizeString(mixed $value, int $maxLength): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        return Str::limit($trimmed, $maxLength, '');
    }

    private function sanitizeDate(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1 ? $trimmed : null;
    }

    private function sanitizeUrl(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '' || filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        return Str::limit($trimmed, 2048, '');
    }

    private function sanitizeMoney(mixed $value): ?float
    {
        if (! is_numeric($value)) {
            return null;
        }

        $amount = (float) $value;

        return $amount >= 0 ? round($amount, 2) : null;
    }

    /**
     * @return array<string, float>
     */
    private function sanitizeConfidence(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $allowedFields = [
            'name',
            'claim_id',
            'pin',
            'administrator',
            'defendant',
            'class_action_url',
            'notification_received_on',
            'claim_submitted_on',
            'claim_deadline',
            'final_approval_hearing_on',
            'payment_election_submitted_on',
            'expected_payment_on',
            'expected_payment_amount',
            'notes',
        ];

        $confidence = [];
        foreach ($value as $key => $score) {
            if (! in_array($key, $allowedFields, true) || ! is_numeric($score)) {
                continue;
            }

            $numeric = (float) $score;
            if ($numeric < 0 || $numeric > 1) {
                continue;
            }

            $confidence[$key] = round($numeric, 4);
        }

        return $confidence;
    }

    private function fetchAllowedClassActionReferenceText(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || ! $this->isAllowedSettlementHost($host)) {
            return null;
        }

        try {
            $response = Http::timeout(20)->get($url);
        } catch (\Throwable) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $contentType = strtolower($response->header('Content-Type'));
        if (! str_contains($contentType, 'text/html') && ! str_contains($contentType, 'application/xhtml+xml')) {
            return null;
        }

        $html = $response->body();
        if (strlen($html) > 1_000_000) {
            return null;
        }

        $dom = new \DOMDocument;
        $loaded = @$dom->loadHTML($html, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET);
        if (! $loaded) {
            return null;
        }

        $text = trim(preg_replace('/\s+/', ' ', $dom->textContent ?? ''));
        if ($text === '') {
            return null;
        }

        return Str::limit($text, 8000, '');
    }

    private function isAllowedSettlementHost(string $host): bool
    {
        $normalizedHost = strtolower($host);
        $allowedHosts = [
            'epiqclassaction.com',
            'angeiongroup.com',
            'jndla.com',
            'krollsettlementadministration.com',
            'abdataclassaction.com',
            'rustconsulting.com',
            'digitaldisbursements.com',
        ];

        foreach ($allowedHosts as $allowedHost) {
            if ($normalizedHost === $allowedHost || str_ends_with($normalizedHost, '.'.$allowedHost)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createPhrResults(GenAiImportJob $job, array $data): void
    {
        $records = $this->phrRecords($data);

        foreach ($records as $index => $record) {
            GenAiImportResult::create([
                'job_id' => $job->id,
                'result_index' => $index,
                'result_json' => json_encode($record),
                'status' => 'pending_review',
            ]);
        }
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<int, mixed>
     */
    private function phrRecords(array $data): array
    {
        if (array_is_list($data)) {
            return $data;
        }

        foreach (['records', 'lab_results', 'vitals', 'office_visits', 'medications', 'immunizations', 'conditions', 'procedures', 'allergies'] as $key) {
            if (isset($data[$key]) && is_array($data[$key])) {
                return array_is_list($data[$key]) ? $data[$key] : [$data[$key]];
            }
        }

        return [$data];
    }

    /**
     * If this is a document_extract tax-form job, mark the linked FileForTaxDocument as failed.
     * This is a no-op for non-document extraction job types (finance_transactions, finance_payslip, etc.)
     * since those don't have a linked document record with a genai_status column.
     *
     * Called in all failure catch blocks to prevent the document being stuck in 'pending' indefinitely.
     */
    private function markLinkedTaxDocumentFailed(GenAiImportJob $job): void
    {
        if ($job->job_type !== 'document_extract') {
            return;
        }

        try {
            $context = $job->getContextArray();
            $documentId = $context['document_id'] ?? null;
            if ($documentId) {
                $taxDoc = FileForTaxDocument::query()->where('document_id', $documentId)->first();
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

    /**
     * @param  array<string, mixed>  $data
     */
    private function createDocumentResults(GenAiImportJob $job, array $data): void
    {
        $context = $job->getContextArray();
        if (isset($context['accounts']) || isset($context['input_kind']) || $this->hasNumericFirstEntry($data)) {
            $this->createMultiAccountDocumentResults($job, $data);

            return;
        }

        $this->createSingleAccountDocumentResults($job, $data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createSingleAccountDocumentResults(GenAiImportJob $job, array $data): void
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
        $documentId = $context['document_id'] ?? null;
        if ($documentId) {
            $taxDoc = FileForTaxDocument::query()->where('document_id', $documentId)->first();
            if ($taxDoc && $taxDoc->genai_job_id === $job->id) {
                $taxDoc->update([
                    'parsed_data' => $data,
                    'genai_status' => 'parsed',
                ]);
                app(DocumentIngestionService::class)->syncFromTaxDocument($taxDoc->refresh());
            }
        }
    }

    /**
     * Handle results for a multi-account document_extract job.
     *
     * The AI returns a JSON array — one element per account/form pair. Each element has:
     *   account_identifier, account_name, form_type, tax_year, parsed_data
     *
     * This method:
     * 1. Stores the full array on the tax-form detail parsed_data.
     * 2. Attempts server-side account matching (last-4 suffix, then name overlap).
     * 3. Creates one fin_document_accounts row per detected account/form pair.
     *    Rows with no match have account_id = null; the user resolves them in the UI.
     *
     * @param  array<string, mixed>  $data
     */
    private function createMultiAccountDocumentResults(GenAiImportJob $job, array $data): void
    {
        GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'result_json' => json_encode($data),
            'status' => 'pending_review',
        ]);

        $context = $job->getContextArray();
        $documentId = $context['document_id'] ?? null;
        if (! $documentId) {
            return;
        }

        $taxDoc = FileForTaxDocument::query()->where('document_id', $documentId)->first();
        if (! $taxDoc || $taxDoc->genai_job_id !== $job->id) {
            return;
        }

        // Load all accounts for this user for matching.
        $userAccounts = FinAccounts::forOwner($taxDoc->user_id)
            ->get(['acct_id', 'acct_name', 'acct_number']);

        // Normalise the AI output: wrap a bare object in an array.
        $entries = $this->hasNumericFirstEntry($data) ? $data : [$data];

        // Wrap lot deletion, link creation, and parent update in a transaction so a
        // mid-loop failure leaves the document in a consistent state (no partial imports).
        DB::transaction(function () use ($taxDoc, $entries, $userAccounts, $context): void {
            // Also clear existing account links so re-processing replaces them cleanly.
            $taxDoc->accountLinks()->delete();
            $taxDoc->documentAccounts()->delete();

            foreach ($entries as $entry) {
                $accountId = $this->matchAccount($entry, $userAccounts);

                // Normalize form_type: validate against allowed set.
                // broker_1099 is the container type for the uploaded PDF — sub-entries returned
                // by the AI should never carry that type. If the AI returns an unrecognized
                // form_type, skip the entry entirely rather than creating a misleading record.
                $rawFormType = trim((string) ($entry['form_type'] ?? ''));
                if (! in_array($rawFormType, FileForTaxDocument::FORM_TYPES, true)) {
                    \Log::error('ParseImportJob: unrecognized form_type from AI, skipping entry', [
                        'document_id' => $taxDoc->document_id,
                        'raw_form_type' => $rawFormType,
                    ]);

                    continue;
                }
                $formType = $rawFormType;

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

                TaxDocumentAccount::createLink(
                    $taxDoc->id,
                    $accountId,
                    $formType,
                    $taxYear,
                    aiIdentifier: $aiIdentifier,
                    aiAccountName: $aiAccountName,
                );

            }

            $taxDoc->update([
                'parsed_data' => $entries,
                'genai_status' => 'parsed',
            ]);
            app(DocumentIngestionService::class)->syncFromTaxDocument($taxDoc->refresh());

            app(LotImportFromParsedDataService::class)->rebuildForDocument((int) $taxDoc->document_id, LotMatcherAutoTrigger::ParseImport);
        });
    }

    /**
     * @param  array<array-key, mixed>  $data
     */
    private function hasNumericFirstEntry(array $data): bool
    {
        return array_key_first($data) === 0;
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
     * @param  Collection<int, FinAccounts>  $accounts
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
        // Split on non-word characters (\W+) for consistency with the TypeScript accountMatcher.ts.
        $pool = $candidates->isNotEmpty() ? $candidates : $accounts;

        if ($aiName === '') {
            return null;
        }

        $aiWords = array_filter(preg_split('/\W+/', $aiName) ?: []);
        $bestScore = 0;
        $bestId = null;

        foreach ($pool as $acct) {
            $acctWords = array_filter(preg_split('/\W+/', strtolower($acct->acct_name)) ?: []);
            $overlap = count(array_intersect($aiWords, $acctWords));
            if ($overlap > $bestScore) {
                $bestScore = $overlap;
                $bestId = $acct->acct_id;
            }
        }

        return $bestScore > 0 ? $bestId : null;
    }
}
