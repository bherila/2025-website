<?php

namespace App\GenAiProcessor\Services;

use App\GenAiProcessor\Models\GenAiDailyQuota;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\Prompts\FinanceTransactionsPromptTemplate;
use App\GenAiProcessor\Services\Prompts\MultiAccountTaxImportPromptTemplate;
use App\GenAiProcessor\Services\Prompts\PayslipPromptTemplate;
use App\GenAiProcessor\Services\Prompts\PromptTemplate;
use App\GenAiProcessor\Services\Prompts\TaxDocumentPromptTemplate;
use App\GenAiProcessor\Services\Prompts\UtilityBillPromptTemplate;
use App\Models\User;
use Bherila\GenAiLaravel\Schema;
use Bherila\GenAiLaravel\ToolChoice;
use Bherila\GenAiLaravel\ToolConfig;
use Bherila\GenAiLaravel\ToolDefinition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class GenAiJobDispatcherService
{
    public const FINANCE_ACCOUNT_TOOL_NAME = 'addFinanceAccount';

    public const TAX_DOCUMENT_W2_TOOL_NAME = 'extractW2Data';

    public const TAX_DOCUMENT_1099INT_TOOL_NAME = 'extract1099IntData';

    public const TAX_DOCUMENT_1099DIV_TOOL_NAME = 'extract1099DivData';

    public const TAX_DOCUMENT_1099MISC_TOOL_NAME = 'extract1099MiscData';

    /**
     * Tool name for extracting Schedule K-1 data (Form 1065 Partnership or Form 1120-S S-Corporation).
     *
     * K-1 data is stored as a flexible JSON blob in parsed_data because the number of
     * line items, codes, and footnotes varies significantly between partnerships and S-corps.
     *
     * Future extension points:
     * - Foreign transactions (Box 16 / Box K) will feed into Form 1116 (Foreign Tax Credit).
     *   When Form 1116 support is added, map box16_* fields to the appropriate Form 1116 lines.
     * - AMT adjustments (Box 17 / Box K) feed into Form 6251.
     */
    public const TAX_DOCUMENT_K1_TOOL_NAME = 'extractK1Data';

    /**
     * Atomically claim a quota slot for today (UTC).
     * Returns false if the site-wide or per-user limit is reached.
     *
     * @param  int  $userId  The user ID to check per-user quota against
     * @param  User|null  $user  Optional user model for per-user settings
     */
    public function claimQuota(int $userId, ?User $user = null): bool
    {
        $siteLimit = (int) env('GEMINI_DAILY_REQUEST_LIMIT', 500);
        $today = now()->utc()->toDateString();

        return DB::transaction(function () use ($today, $siteLimit, $userId, $user) {
            // Get or create today's quota row atomically
            $quota = GenAiDailyQuota::firstOrCreate(
                ['usage_date' => $today],
                ['request_count' => 0]
            );

            // Reload with lock for update (no-op on SQLite but works on MySQL)
            $quota = GenAiDailyQuota::where('usage_date', $today)->lockForUpdate()->first();

            if ($quota->request_count >= $siteLimit) {
                Log::info('GenAI daily site-wide quota exhausted', [
                    'date' => $today,
                    'count' => $quota->request_count,
                    'limit' => $siteLimit,
                ]);

                return false;
            }

            // Per-user quota check (user's configured limit; -1 = unlimited)
            $userModel = $user ?? User::find($userId);
            $userLimit = $userModel?->genai_daily_quota_limit ?? -1;
            if ($userLimit >= 0) {
                $userCount = GenAiImportJob::where('user_id', $userId)
                    ->whereDate('created_at', $today)
                    ->whereIn('status', ['processing', 'parsed', 'imported'])
                    ->count();

                if ($userCount >= $userLimit) {
                    Log::info('GenAI daily per-user quota exhausted', [
                        'user_id' => $userId,
                        'date' => $today,
                        'count' => $userCount,
                        'limit' => $userLimit,
                    ]);

                    return false;
                }
            }

            $quota->update([
                'request_count' => $quota->request_count + 1,
                'updated_at' => now(),
            ]);

            return true;
        });
    }

    /**
     * Return the human-readable LLM prompt and expected JSON schema for a tax document form type.
     *
     * Used by the "Attach JSON" feature so users can extract data manually via any LLM
     * and paste the result back without needing Gemini tool calls.
     *
     * The returned prompt is stripped of the internal `<!-- tool:... -->` marker and augmented
     * with JSON-output instructions.  The `json_schema` mirrors the properties of the Gemini
     * tool definition for W-2 / 1099 forms; for K-1 it reflects the FK1StructuredData shape
     * (the format that is actually stored in `parsed_data` and consumed by the UI).
     *
     * @return array{prompt: string, json_schema: array<string,mixed>, form_label: string}
     */
    public function getTaxDocumentPromptInfo(string $formType, int $taxYear): array
    {
        $rawPrompt = $this->buildPrompt('tax_document', ['form_type' => $formType, 'tax_year' => $taxYear]);

        // Strip the internal `<!-- tool:... -->` marker so users don't see it
        $cleanInstructions = trim((string) preg_replace('/<!--\s*tool:[^>]+-->\s*\n?/', '', $rawPrompt));

        // Build the JSON schema the user should produce
        if ($formType === 'k1') {
            $jsonSchema = $this->buildK1ManualJsonSchema();
        } else {
            $toolDef = $this->buildTaxDocumentToolDefinitionFromPrompt($rawPrompt);
            $jsonSchema = $toolDef ? ($toolDef->inputSchema->toArray()['properties'] ?? []) : [];
        }

        // Build a complete copy-paste prompt for external LLMs (no tool calls)
        $schemaJson = json_encode($jsonSchema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $fullPrompt = <<<PROMPT
{$cleanInstructions}

──────────────────────────────────────────
IMPORTANT: Since tool calls are not available, return ONLY a single valid JSON object
with no markdown, no code fences, and no additional explanation.
The JSON must exactly match this schema:

{$schemaJson}
PROMPT;

        $formLabels = [
            'w2' => 'W-2',
            'w2c' => 'W-2c',
            '1099_int' => '1099-INT',
            '1099_div' => '1099-DIV',
            '1099_misc' => '1099-MISC',
            'k1' => 'K-1 / K-3',
        ];

        return [
            'prompt' => $fullPrompt,
            'json_schema' => $jsonSchema,
            'form_label' => $formLabels[$formType] ?? $formType,
        ];
    }

    /**
     * Returns the expected JSON schema for manual K-1 / K-3 attachment.
     * This mirrors the FK1StructuredData shape stored in parsed_data.
     *
     * @return array<string,mixed>
     */
    private function buildK1ManualJsonSchema(): array
    {
        return [
            'schemaVersion' => [
                'type' => 'STRING',
                'description' => 'Must be exactly "2026.1"',
            ],
            'formType' => [
                'type' => 'STRING',
                'description' => 'e.g. "K-1-1065" for partnerships, "K-1-1120S" for S-corps',
            ],
            'formId' => [
                'type' => 'STRING',
                'description' => 'Form identifier / partner number from the K-1 header (optional)',
            ],
            'fields' => [
                'type' => 'OBJECT',
                'description' => 'All flat K-1 boxes keyed by identifier (A–O, 1–10, 12, 21). '
                    .'Each value is an object: { "value": "<string>", "confidence": <0-1> }.',
                'example' => [
                    'A' => ['value' => 'Acme Partnership LLC'],
                    '1' => ['value' => '12345.67'],
                    '21' => ['value' => '150.00'],
                ],
            ],
            'codes' => [
                'type' => 'OBJECT',
                'description' => 'Coded K-1 boxes (11, 13–20) keyed by box number. '
                    .'Each is an array of { "code": "<letter>", "value": "<string>", "notes": "<optional>" }.',
                'example' => [
                    '11' => [
                        ['code' => 'A', 'value' => '500.00', 'notes' => 'Net long-term capital gain'],
                        ['code' => 'ZZ', 'value' => '-2500.00', 'notes' => 'Other item — §988 loss'],
                    ],
                    '16' => [
                        ['code' => 'I', 'value' => '75.00', 'notes' => 'Foreign taxes paid — passive basket'],
                    ],
                ],
            ],
            'k3' => [
                'type' => 'OBJECT',
                'description' => 'Schedule K-3 data (omit entirely if no K-3 was attached). '
                    .'Shape: { "sections": [ { "sectionId": "part2_section1", "title": "...", "data": { ... } } ] }',
            ],
            'warnings' => [
                'type' => 'ARRAY',
                'description' => 'Array of warning strings for ambiguous or complex items (optional).',
            ],
        ];
    }

    /**
     * Build the Gemini prompt for the given job type and context.
     *
     * Each job type delegates to a dedicated {@see PromptTemplate}
     * subclass. Add new job types by creating a new template class and registering it here.
     *
     * @param  array<string, mixed>  $context
     */
    public function buildPrompt(string $jobType, array $context): string
    {
        $template = match ($jobType) {
            'finance_transactions' => new FinanceTransactionsPromptTemplate,
            'finance_payslip' => new PayslipPromptTemplate,
            'utility_bill' => new UtilityBillPromptTemplate,
            'tax_document' => new TaxDocumentPromptTemplate,
            'tax_form_multi_account_import' => new MultiAccountTaxImportPromptTemplate,
            default => throw new \InvalidArgumentException("Unknown job type: {$jobType}"),
        };

        return $template->build($context);
    }

    /**
     * Build the tool configuration for a given job type.
     * Returns null for job types that use JSON-mode output instead of function calling.
     *
     * @param  string  $prompt  Required for tax_document jobs to extract the form type marker.
     */
    public function buildToolConfig(string $jobType, string $prompt = ''): ?ToolConfig
    {
        if ($jobType === 'finance_transactions') {
            return new ToolConfig(
                tools: [$this->buildFinanceAccountToolDefinition()],
                choice: ToolChoice::any(),
            );
        }

        if ($jobType === 'tax_document' && $prompt !== '') {
            $toolDef = $this->buildTaxDocumentToolDefinitionFromPrompt($prompt);
            if ($toolDef !== null) {
                return new ToolConfig(
                    tools: [$toolDef],
                    choice: ToolChoice::any(),
                );
            }
        }

        // All other job types use JSON-mode output
        return null;
    }

    /**
     * Build the Gemini generateContent payload for the given job type.
     *
     * @return array<string, mixed>
     *
     * @deprecated Use GeminiClient::converseWithFileRef() + buildToolConfig() instead.
     */
    public function buildGenerateContentPayload(string $jobType, string $fileUri, string $mimeType, string $prompt): array
    {
        $payload = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $prompt],
                        [
                            'file_data' => [
                                'mime_type' => $mimeType,
                                'file_uri' => $fileUri,
                            ],
                        ],
                    ],
                ],
            ],
        ];

        if ($jobType === 'finance_transactions') {
            $toolDef = $this->buildFinanceAccountToolDefinition();
            $payload['tools'] = [[
                'function_declarations' => [['name' => $toolDef->name, 'description' => $toolDef->description, 'parameters' => $toolDef->inputSchema->toArray()]],
            ]];
            $payload['toolConfig'] = [
                'functionCallingConfig' => [
                    'mode' => 'ANY',
                    'allowedFunctionNames' => [self::FINANCE_ACCOUNT_TOOL_NAME],
                ],
            ];

            return $payload;
        }

        if ($jobType === 'tax_document') {
            // Extract the form_type from the prompt text to pick the right tool
            // The prompt is built with the context; we store the tool name in a comment marker
            $toolDef = $this->buildTaxDocumentToolDefinitionFromPrompt($prompt);
            if ($toolDef !== null) {
                $payload['tools'] = [[
                    'function_declarations' => [['name' => $toolDef->name, 'description' => $toolDef->description, 'parameters' => $toolDef->inputSchema->toArray()]],
                ]];
                $payload['toolConfig'] = [
                    'functionCallingConfig' => [
                        'mode' => 'ANY',
                        'allowedFunctionNames' => [$toolDef->name],
                    ],
                ];

                return $payload;
            }
        }

        $payload['generationConfig'] = [
            'response_mime_type' => 'application/json',
        ];

        return $payload;
    }

    /**
     * Extract typed structured data from a Gemini generateContent response.
     *
     * @param  array<string, mixed>  $responseBody
     * @return array<string, mixed>|null
     */
    public function extractGenerateContentData(string $jobType, array $responseBody): ?array
    {
        if ($jobType === 'finance_transactions') {
            return $this->extractFinanceGenerateContentData($responseBody);
        }

        if ($jobType === 'tax_document') {
            return $this->extractTaxDocumentGenerateContentData($responseBody);
        }

        if ($jobType === 'tax_form_multi_account_import') {
            // Expects a JSON array of per-account entries from the model.
            $jsonText = $this->extractTextParts($responseBody);
            if ($jsonText === '') {
                return null;
            }
            $data = json_decode($jsonText, true);

            return json_last_error() === JSON_ERROR_NONE ? $data : null;
        }

        $jsonText = $this->extractTextParts($responseBody);
        if ($jsonText === '') {
            return null;
        }

        $data = json_decode($jsonText, true);

        return json_last_error() === JSON_ERROR_NONE ? $data : null;
    }

    /**
     * Validate context_json against the expected schema for the given job_type.
     * Returns true if valid, throws on invalid.
     *
     * @param  array<string, mixed>|null  $context
     *
     * @throws \InvalidArgumentException
     */
    public function validateContext(string $jobType, ?array $context): bool
    {
        if ($context === null) {
            return true;
        }

        $allowedKeys = match ($jobType) {
            'finance_transactions' => ['accounts'],
            'finance_payslip' => ['employment_entity_id', 'file_count'],
            'utility_bill' => ['account_type', 'utility_account_id', 'file_count'],
            'tax_document' => ['tax_year', 'form_type', 'tax_document_id'],
            'tax_form_multi_account_import' => ['tax_document_id', 'tax_year', 'accounts'],
            default => throw new \InvalidArgumentException("Unknown job type: {$jobType}"),
        };

        $unexpectedKeys = array_diff(array_keys($context), $allowedKeys);
        if (! empty($unexpectedKeys)) {
            throw new \InvalidArgumentException(
                'Unexpected context keys for '.$jobType.': '.implode(', ', $unexpectedKeys)
            );
        }

        // Validate specific field types
        if ($jobType === 'finance_transactions' && isset($context['accounts'])) {
            if (! is_array($context['accounts'])) {
                throw new \InvalidArgumentException('context.accounts must be an array');
            }
            foreach ($context['accounts'] as $account) {
                if (! is_array($account) || ! isset($account['name']) || ! isset($account['last4'])) {
                    throw new \InvalidArgumentException('Each account must have name and last4');
                }
                if (strlen($account['last4']) > 4) {
                    throw new \InvalidArgumentException('Account last4 must be at most 4 characters');
                }
            }
        }

        if ($jobType === 'finance_payslip' && isset($context['employment_entity_id'])) {
            if (! is_int($context['employment_entity_id']) && ! ctype_digit((string) $context['employment_entity_id'])) {
                throw new \InvalidArgumentException('employment_entity_id must be an integer');
            }
        }

        if ($jobType === 'utility_bill') {
            if (isset($context['utility_account_id']) && ! is_int($context['utility_account_id']) && ! ctype_digit((string) $context['utility_account_id'])) {
                throw new \InvalidArgumentException('utility_account_id must be an integer');
            }
        }

        return true;
    }

    // ── Finance extract / normalize methods ───────────────────────────────────

    /**
     * @param  array<string, mixed>  $responseBody
     * @return array<string, mixed>|null
     */
    private function extractFinanceGenerateContentData(array $responseBody): ?array
    {
        $toolCalls = [];

        $parts = $responseBody['candidates'][0]['content']['parts'] ?? [];
        if (is_array($parts)) {
            foreach ($parts as $part) {
                if (! is_array($part)) {
                    continue;
                }

                $functionCall = $part['functionCall'] ?? null;
                if (! is_array($functionCall) || ($functionCall['name'] ?? null) !== self::FINANCE_ACCOUNT_TOOL_NAME) {
                    continue;
                }

                $args = $functionCall['args'] ?? [];
                if (! is_array($args)) {
                    continue;
                }

                $toolCalls[] = [
                    'toolName' => self::FINANCE_ACCOUNT_TOOL_NAME,
                    'payload' => $this->normalizeFinanceAccountPayload($args),
                ];
            }
        }

        if ($toolCalls !== []) {
            return ['toolCalls' => $toolCalls];
        }

        $jsonText = $this->extractTextParts($responseBody);
        if ($jsonText === '') {
            return null;
        }

        $data = json_decode($jsonText, true);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($data)) {
            return null;
        }

        return $this->normalizeFinanceJsonResponse($data);
    }

    /**
     * @param  array<string, mixed>  $responseBody
     */
    private function extractTextParts(array $responseBody): string
    {
        $parts = $responseBody['candidates'][0]['content']['parts'] ?? [];
        if (! is_array($parts)) {
            return '';
        }

        $text = '';
        foreach ($parts as $part) {
            if (! is_array($part) || ! isset($part['text']) || ! is_string($part['text'])) {
                continue;
            }

            $text .= $part['text'];
        }

        return preg_replace('/^```json\s*|\s*```$/s', '', trim($text)) ?? '';
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null
     */
    private function normalizeFinanceJsonResponse(array $data): ?array
    {
        if (isset($data['toolCalls']) && is_array($data['toolCalls'])) {
            $toolCalls = [];

            foreach ($data['toolCalls'] as $toolCall) {
                if (! is_array($toolCall)) {
                    continue;
                }

                $toolName = $toolCall['toolName'] ?? $toolCall['name'] ?? null;
                if ($toolName !== self::FINANCE_ACCOUNT_TOOL_NAME) {
                    continue;
                }

                $payload = $toolCall['payload'] ?? $toolCall['args'] ?? [];
                if (! is_array($payload)) {
                    continue;
                }

                $toolCalls[] = [
                    'toolName' => self::FINANCE_ACCOUNT_TOOL_NAME,
                    'payload' => $this->normalizeFinanceAccountPayload($payload),
                ];
            }

            return ['toolCalls' => $toolCalls];
        }

        $accounts = [];

        if (isset($data['accounts']) && is_array($data['accounts'])) {
            foreach ($data['accounts'] as $account) {
                if (is_array($account)) {
                    $accounts[] = $account;
                }
            }
        } elseif (array_intersect(['statementInfo', 'statementDetails', 'transactions', 'lots'], array_keys($data)) !== []) {
            $accounts[] = [
                'statementInfo' => $data['statementInfo'] ?? [],
                'statementDetails' => $data['statementDetails'] ?? [],
                'transactions' => $data['transactions'] ?? [],
                'lots' => $data['lots'] ?? [],
            ];
        }

        if ($accounts === []) {
            return null;
        }

        return [
            'toolCalls' => array_map(fn (array $account): array => [
                'toolName' => self::FINANCE_ACCOUNT_TOOL_NAME,
                'payload' => $this->normalizeFinanceAccountPayload($account),
            ], $accounts),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizeFinanceAccountPayload(array $payload): array
    {
        $statementInfo = isset($payload['statementInfo']) && is_array($payload['statementInfo'])
            ? $payload['statementInfo']
            : [];

        $normalizedStatementInfo = [];
        foreach (['brokerName', 'accountNumber', 'accountName'] as $stringKey) {
            if (isset($statementInfo[$stringKey]) && is_string($statementInfo[$stringKey]) && trim($statementInfo[$stringKey]) !== '') {
                $normalizedStatementInfo[$stringKey] = trim($statementInfo[$stringKey]);
            }
        }

        foreach (['periodStart', 'periodEnd'] as $dateKey) {
            $date = $this->normalizeDateString($statementInfo[$dateKey] ?? null);
            if ($date !== null) {
                $normalizedStatementInfo[$dateKey] = $date;
            }
        }

        $closingBalance = $this->normalizeNumber($statementInfo['closingBalance'] ?? null);
        if ($closingBalance !== null) {
            $normalizedStatementInfo['closingBalance'] = $closingBalance;
        }

        return [
            'statementInfo' => $normalizedStatementInfo,
            'statementDetails' => $this->normalizeStatementDetails($payload['statementDetails'] ?? []),
            'transactions' => $this->normalizeTransactions($payload['transactions'] ?? []),
            'lots' => $this->normalizeLots($payload['lots'] ?? []),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeStatementDetails(mixed $details): array
    {
        if (! is_array($details)) {
            return [];
        }

        $normalized = [];
        foreach ($details as $detail) {
            if (! is_array($detail)) {
                continue;
            }

            $section = is_string($detail['section'] ?? null) ? trim($detail['section']) : '';
            $lineItem = is_string($detail['line_item'] ?? null) ? trim($detail['line_item']) : '';
            $statementPeriodValue = $this->normalizeNumber($detail['statement_period_value'] ?? null);
            $ytdValue = $this->normalizeNumber($detail['ytd_value'] ?? null);

            if ($section === '' || $lineItem === '' || $statementPeriodValue === null || $ytdValue === null) {
                continue;
            }

            $normalized[] = [
                'section' => $section,
                'line_item' => $lineItem,
                'statement_period_value' => $statementPeriodValue,
                'ytd_value' => $ytdValue,
                'is_percentage' => $this->normalizeBoolean($detail['is_percentage'] ?? null) ?? false,
            ];
        }

        return $normalized;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeTransactions(mixed $transactions): array
    {
        if (! is_array($transactions)) {
            return [];
        }

        $normalized = [];
        foreach ($transactions as $transaction) {
            if (! is_array($transaction)) {
                continue;
            }

            $date = $this->normalizeDateString($transaction['date'] ?? null);
            $description = is_string($transaction['description'] ?? null) ? trim($transaction['description']) : '';
            $amount = $this->normalizeNumber($transaction['amount'] ?? null);

            if ($date === null || $description === '' || $amount === null) {
                continue;
            }

            $item = [
                'date' => $date,
                'description' => $description,
                'amount' => $amount,
            ];

            foreach (['type', 'symbol'] as $stringKey) {
                if (isset($transaction[$stringKey]) && is_string($transaction[$stringKey]) && trim($transaction[$stringKey]) !== '') {
                    $item[$stringKey] = trim($transaction[$stringKey]);
                }
            }

            foreach (['quantity', 'price', 'commission', 'fee'] as $numberKey) {
                $number = $this->normalizeNumber($transaction[$numberKey] ?? null);
                if ($number !== null) {
                    $item[$numberKey] = $number;
                }
            }

            $normalized[] = $item;
        }

        return $normalized;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeLots(mixed $lots): array
    {
        if (! is_array($lots)) {
            return [];
        }

        $normalized = [];
        foreach ($lots as $lot) {
            if (! is_array($lot)) {
                continue;
            }

            $symbolRaw = $lot['symbol'] ?? null;
            $symbol = is_string($symbolRaw) ? trim($symbolRaw) : '';
            if ($symbol === '') {
                continue;
            }

            $purchaseDate = $this->normalizeDateString($lot['purchaseDate'] ?? null);
            $costBasis = $this->normalizeNumber($lot['costBasis'] ?? null);
            $quantity = $this->normalizeNumber($lot['quantity'] ?? null);

            if ($purchaseDate === null || $costBasis === null || $quantity === null) {
                continue;
            }

            $item = [
                'symbol' => $symbol,
                'quantity' => $quantity,
                'purchaseDate' => $purchaseDate,
                'costBasis' => $costBasis,
            ];

            if (isset($lot['description']) && is_string($lot['description']) && trim($lot['description']) !== '') {
                $item['description'] = trim($lot['description']);
            }

            foreach (['costPerUnit', 'marketValue', 'unrealizedGainLoss', 'proceeds', 'realizedGainLoss'] as $numberKey) {
                $number = $this->normalizeNumber($lot[$numberKey] ?? null);
                if ($number !== null) {
                    $item[$numberKey] = $number;
                }
            }

            $saleDate = $this->normalizeDateString($lot['saleDate'] ?? null);
            if ($saleDate !== null) {
                $item['saleDate'] = $saleDate;
            }

            $normalized[] = $item;
        }

        return $normalized;
    }

    private function normalizeDateString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : preg_split('/[ T]/', $trimmed)[0];
    }

    private function normalizeNumber(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return is_finite((float) $value) ? (float) $value : null;
        }

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $isNegative = preg_match('/^\(.*\)$/', $trimmed) === 1;
        $normalized = str_replace([',', '%', '(', ')', ' '], '', $trimmed);

        if (! is_numeric($normalized)) {
            return null;
        }

        $number = (float) $normalized;

        return $isNegative ? -$number : $number;
    }

    private function normalizeBoolean(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            return match (strtolower(trim($value))) {
                'true' => true,
                'false' => false,
                default => null,
            };
        }

        return null;
    }

    private function buildFinanceAccountToolDefinition(): ToolDefinition
    {
        return new ToolDefinition(
            self::FINANCE_ACCOUNT_TOOL_NAME,
            'Add one parsed finance account from a bank or brokerage statement.',
            Schema::object(
                [
                    'statementInfo' => Schema::object([
                        'brokerName' => Schema::string(),
                        'accountNumber' => Schema::string(),
                        'accountName' => Schema::string(),
                        'periodStart' => Schema::string(),
                        'periodEnd' => Schema::string(),
                        'closingBalance' => Schema::number(),
                    ]),
                    'statementDetails' => Schema::arrayOf(
                        Schema::object(
                            [
                                'section' => Schema::string(),
                                'line_item' => Schema::string(),
                                'statement_period_value' => Schema::number(),
                                'ytd_value' => Schema::number(),
                                'is_percentage' => Schema::boolean(),
                            ],
                            ['section', 'line_item', 'statement_period_value', 'ytd_value', 'is_percentage'],
                        )
                    ),
                    'transactions' => Schema::arrayOf(
                        Schema::object(
                            [
                                'date' => Schema::string(),
                                'description' => Schema::string(),
                                'amount' => Schema::number(),
                                'type' => Schema::string(),
                                'symbol' => Schema::string(),
                                'quantity' => Schema::number(),
                                'price' => Schema::number(),
                                'commission' => Schema::number(),
                                'fee' => Schema::number(),
                            ],
                            ['date', 'description', 'amount'],
                        )
                    ),
                    'lots' => Schema::arrayOf(
                        Schema::object(
                            [
                                'symbol' => Schema::string(),
                                'description' => Schema::string(),
                                'quantity' => Schema::number(),
                                'purchaseDate' => Schema::string(),
                                'costBasis' => Schema::number(),
                                'costPerUnit' => Schema::number(),
                                'marketValue' => Schema::number(),
                                'unrealizedGainLoss' => Schema::number(),
                                'saleDate' => Schema::string(),
                                'proceeds' => Schema::number(),
                                'realizedGainLoss' => Schema::number(),
                            ],
                            ['symbol', 'quantity', 'purchaseDate', 'costBasis'],
                        )
                    ),
                ],
                ['statementInfo', 'statementDetails', 'transactions', 'lots'],
            ),
        );
    }

    /**
     * Extracts the tool name marker from the prompt and returns the tool definition.
     * Returns null if no marker is found.
     */
    private function buildTaxDocumentToolDefinitionFromPrompt(string $prompt): ?ToolDefinition
    {
        if (str_contains($prompt, self::TAX_DOCUMENT_W2_TOOL_NAME)) {
            return $this->buildW2ToolDefinition();
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099INT_TOOL_NAME)) {
            return $this->build1099IntToolDefinition();
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099DIV_TOOL_NAME)) {
            return $this->build1099DivToolDefinition();
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099MISC_TOOL_NAME)) {
            return $this->build1099MiscToolDefinition();
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_K1_TOOL_NAME)) {
            return $this->buildK1ToolDefinition();
        }

        return null;
    }

    /**
     * Extract structured data from a tax_document Gemini tool-call response.
     * Falls back to JSON text parsing if no function call is found.
     *
     * @param  array<string, mixed>  $responseBody
     * @return array<string, mixed>|null
     */
    private function extractTaxDocumentGenerateContentData(array $responseBody): ?array
    {
        $taxToolNames = [
            self::TAX_DOCUMENT_W2_TOOL_NAME,
            self::TAX_DOCUMENT_1099INT_TOOL_NAME,
            self::TAX_DOCUMENT_1099DIV_TOOL_NAME,
            self::TAX_DOCUMENT_1099MISC_TOOL_NAME,
            self::TAX_DOCUMENT_K1_TOOL_NAME,
        ];

        $parts = $responseBody['candidates'][0]['content']['parts'] ?? [];
        if (is_array($parts)) {
            foreach ($parts as $part) {
                if (! is_array($part)) {
                    continue;
                }
                $functionCall = $part['functionCall'] ?? null;
                if (! is_array($functionCall)) {
                    continue;
                }
                $toolName = $functionCall['name'] ?? null;
                if (! in_array($toolName, $taxToolNames, true)) {
                    continue;
                }
                $args = $functionCall['args'] ?? [];
                if (! is_array($args)) {
                    continue;
                }

                return $this->coerceTaxDocumentArgs($toolName, $args);
            }
        }

        // Fallback: try to extract JSON from text parts
        $jsonText = $this->extractTextParts($responseBody);
        if ($jsonText === '') {
            return null;
        }
        $data = json_decode($jsonText, true);

        return (json_last_error() === JSON_ERROR_NONE && is_array($data)) ? $data : null;
    }

    /**
     * Coerce and validate the args returned by the Gemini tool call for tax documents.
     * Ensures all numeric fields are cast to float|null and strings to string|null.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function coerceTaxDocumentArgs(string $toolName, array $args): array
    {
        $moneyFields = match ($toolName) {
            self::TAX_DOCUMENT_W2_TOOL_NAME => [
                'box1_wages', 'box2_fed_tax', 'box3_ss_wages', 'box4_ss_tax',
                'box5_medicare_wages', 'box6_medicare_tax', 'box7_ss_tips',
                'box8_allocated_tips', 'box10_dependent_care', 'box11_nonqualified',
                'box16_state_wages', 'box17_state_tax', 'box18_local_wages', 'box19_local_tax',
            ],
            self::TAX_DOCUMENT_1099INT_TOOL_NAME => [
                'box1_interest', 'box2_early_withdrawal', 'box3_savings_bond', 'box4_fed_tax',
                'box5_investment_expense', 'box6_foreign_tax', 'box8_tax_exempt',
                'box9_private_activity', 'box10_market_discount', 'box11_bond_premium',
                'box12_treasury_premium', 'box13_tax_exempt_premium',
            ],
            self::TAX_DOCUMENT_1099DIV_TOOL_NAME => [
                'box1a_ordinary', 'box1b_qualified', 'box2a_cap_gain', 'box2b_unrecap_1250',
                'box2c_section_1202', 'box2d_collectibles', 'box2e_section_897_ordinary',
                'box2f_section_897_cap_gain', 'box3_nondividend', 'box4_fed_tax',
                'box5_section_199a', 'box6_investment_expense', 'box7_foreign_tax',
                'box9_cash_liquidation', 'box10_noncash_liquidation', 'box11_exempt_interest',
                'box12_private_activity', 'box14_state_tax',
            ],
            self::TAX_DOCUMENT_1099MISC_TOOL_NAME => [
                'box1_rents', 'box2_royalties', 'box3_other_income', 'box4_fed_tax',
                'box5_fishing_boat', 'box6_medical', 'box8_substitute_payments',
                'box9_crop_insurance', 'box10_gross_proceeds_attorney',
                'box11_fish_purchased', 'box12_section_409a_deferrals',
                'box14_excess_golden_parachute', 'box15_nonqualified_deferred',
                'box16_state_tax',
            ],
            default => [],
        };

        $stringFields = match ($toolName) {
            self::TAX_DOCUMENT_W2_TOOL_NAME => [
                'employer_name', 'employer_ein', 'employee_name', 'employee_ssn_last4',
                'box15_state', 'box20_locality',
            ],
            self::TAX_DOCUMENT_1099INT_TOOL_NAME => [
                'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin_last4',
                'box7_foreign_country', 'account_number',
            ],
            self::TAX_DOCUMENT_1099DIV_TOOL_NAME => [
                'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin_last4',
                'box8_foreign_country', 'box13_state', 'account_number',
            ],
            self::TAX_DOCUMENT_1099MISC_TOOL_NAME => [
                'payer_name', 'payer_tin', 'recipient_name', 'recipient_tin_last4',
                'box13_fatca_filing', 'box15_state', 'account_number',
            ],
            default => [],
        };

        $coerced = [];

        // Coerce money fields
        foreach ($moneyFields as $field) {
            if (! array_key_exists($field, $args)) {
                $coerced[$field] = null;
            } elseif ($args[$field] === null || $args[$field] === '') {
                $coerced[$field] = null;
            } else {
                $coerced[$field] = is_numeric($args[$field]) ? (float) $args[$field] : null;
            }
        }

        // Coerce string fields
        foreach ($stringFields as $field) {
            if (! array_key_exists($field, $args)) {
                $coerced[$field] = null;
            } elseif ($args[$field] === null || $args[$field] === '') {
                $coerced[$field] = null;
            } else {
                $coerced[$field] = (string) $args[$field];
            }
        }

        // Handle W-2 specific structured fields
        if ($toolName === self::TAX_DOCUMENT_W2_TOOL_NAME) {
            // box12_codes: array of {code: string, amount: number}
            $box12 = $args['box12_codes'] ?? [];
            $coerced['box12_codes'] = is_array($box12)
                ? array_values(array_filter(array_map(function ($item) {
                    if (! is_array($item) || ! isset($item['code'])) {
                        return null;
                    }

                    return [
                        'code' => (string) $item['code'],
                        'amount' => is_numeric($item['amount'] ?? null) ? (float) $item['amount'] : 0.0,
                    ];
                }, $box12)))
                : [];

            // box14_other: array of {label: string, amount: number}
            $box14 = $args['box14_other'] ?? [];
            $coerced['box14_other'] = is_array($box14)
                ? array_values(array_filter(array_map(function ($item) {
                    if (! is_array($item) || ! isset($item['label'])) {
                        return null;
                    }

                    return [
                        'label' => (string) $item['label'],
                        'amount' => is_numeric($item['amount'] ?? null) ? (float) $item['amount'] : 0.0,
                    ];
                }, $box14)))
                : [];

            // box13 booleans
            foreach (['box13_statutory', 'box13_retirement', 'box13_sick_pay'] as $boolField) {
                $coerced[$boolField] = isset($args[$boolField]) ? (bool) $args[$boolField] : null;
            }
        }

        // Handle 1099-MISC boolean field
        if ($toolName === self::TAX_DOCUMENT_1099MISC_TOOL_NAME) {
            $coerced['box7_direct_sales_indicator'] = isset($args['box7_direct_sales_indicator'])
                ? (bool) $args['box7_direct_sales_indicator']
                : null;
        }

        // Handle K-1: transform flat tool output into FK1StructuredData shape
        if ($toolName === self::TAX_DOCUMENT_K1_TOOL_NAME) {
            return $this->coerceK1Args($args);
        }

        return $coerced;
    }

    /**
     * Transform the flat extractK1Data tool response into the canonical FK1StructuredData JSON.
     *
     * The tool uses flat field names (field_A, field_1, codes_11, etc.) for Gemini compatibility.
     * This method assembles them into the nested structure stored in parsed_data.
     *
     * Adds server-stamped extraction metadata and the schemaVersion discriminator so the
     * frontend can reliably detect new-format documents.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function coerceK1Args(array $args): array
    {
        // Scalar field boxes (left panel A–O, right panel 1–10, 12, 21)
        $strBoxes = ['A', 'B', 'C', 'E', 'F', 'G', 'H1', 'I1', 'I2', 'I3', 'M', 'N', 'O'];
        $boolBoxes = ['D', 'H2', 'partnershipPosition_traderInSecurities'];
        $numBoxes = ['1', '2', '3', '4', '4a', '4b', '4c', '5', '6a', '6b', '6c', '7',
            '8', '9a', '9b', '9c', '10', '12', '21'];
        $codedBoxes = ['11', '13', '14', '15', '16', '17', '18', '19', '20'];

        $fields = [];

        foreach ($strBoxes as $box) {
            $raw = $args["field_{$box}"] ?? null;
            $value = ($raw !== null && $raw !== '') ? (string) $raw : null;
            if ($value !== null) {
                $fields[$box] = ['value' => $value];
            }
        }

        foreach ($boolBoxes as $box) {
            $raw = $args["field_{$box}"] ?? null;
            if ($raw === null) {
                continue;
            }

            $boolValue = null;

            if (is_bool($raw)) {
                $boolValue = $raw;
            } elseif (is_int($raw) || is_float($raw)) {
                if ((int) $raw === 1) {
                    $boolValue = true;
                } elseif ((int) $raw === 0) {
                    $boolValue = false;
                }
            } elseif (is_string($raw)) {
                $normalized = strtolower(trim($raw));
                if (in_array($normalized, ['true', '1'], true)) {
                    $boolValue = true;
                } elseif (in_array($normalized, ['false', '0'], true)) {
                    $boolValue = false;
                }
            }

            if ($boolValue !== null) {
                $fields[$box] = ['value' => $boolValue ? 'true' : 'false'];
            }
        }

        foreach ($numBoxes as $box) {
            $raw = $args["field_{$box}"] ?? null;
            if (is_numeric($raw)) {
                $fields[$box] = ['value' => (string) (float) $raw];
            }
        }

        // Structured Item J (profit/loss/capital %), Item K (liabilities), Item L (capital account)
        $structuredFields = [
            'J_profit_beginning', 'J_profit_ending', 'J_loss_beginning', 'J_loss_ending',
            'J_capital_beginning', 'J_capital_ending',
            'K_recourse_beginning', 'K_recourse_ending',
            'K_nonrecourse_beginning', 'K_nonrecourse_ending',
            'K_qual_nonrecourse_beginning', 'K_qual_nonrecourse_ending',
            'L_beginning_capital', 'L_contributed', 'L_current_year_net',
            'L_other_increase', 'L_withdrawals', 'L_ending_capital',
        ];
        foreach ($structuredFields as $key) {
            $raw = $args["field_{$key}"] ?? null;
            if (is_numeric($raw)) {
                $fields[$key] = ['value' => (string) (float) $raw];
            }
        }
        $rawMethod = $args['field_L_capital_method'] ?? null;
        if ($rawMethod !== null && $rawMethod !== '') {
            $fields['L_capital_method'] = ['value' => (string) $rawMethod];
        }

        // Coded boxes
        $codes = [];
        foreach ($codedBoxes as $box) {
            $rawItems = $args["codes_{$box}"] ?? [];
            $normalized = $this->normalizeCodeItems(is_array($rawItems) ? $rawItems : []);
            if (! empty($normalized)) {
                $codes[$box] = $normalized;
            }
        }

        // Schedule K-3 — assemble structured sections from new flat arrays
        $k3Sections = (new K3SectionAssembler)->assemble($args);

        // §199A Statement A — map snake_case tool keys → camelCase FK1StructuredData shape
        $statementA = null;
        $rawSa = $args['statement_a'] ?? null;
        if (is_array($rawSa) && isset($rawSa['qualified_business_income'])) {
            $statementA = [
                'qualifiedBusinessIncome' => is_numeric($rawSa['qualified_business_income']) ? (float) $rawSa['qualified_business_income'] : 0.0,
                'w2Wages' => is_numeric($rawSa['w2_wages'] ?? null) ? (float) $rawSa['w2_wages'] : 0.0,
                'ubia' => is_numeric($rawSa['ubia'] ?? null) ? (float) $rawSa['ubia'] : 0.0,
                'reitDividends' => is_numeric($rawSa['reit_dividends'] ?? null) ? (float) $rawSa['reit_dividends'] : 0.0,
                'ptpIncome' => is_numeric($rawSa['ptp_income'] ?? null) ? (float) $rawSa['ptp_income'] : 0.0,
                'isSstb' => $this->parseBoolArg($rawSa['is_sstb'] ?? false),
            ];
            if (isset($rawSa['trade_name']) && $rawSa['trade_name'] !== '') {
                $statementA['tradeName'] = (string) $rawSa['trade_name'];
            }
        }

        // Warnings
        $rawWarnings = $args['warnings'] ?? [];
        $warnings = is_array($rawWarnings)
            ? array_values(array_filter(array_map(fn ($w) => is_string($w) ? $w : null, $rawWarnings)))
            : [];

        $result = [
            'schemaVersion' => '2026.1',
            'formType' => isset($args['formType']) ? (string) $args['formType'] : 'K-1-1065',
            'formId' => isset($args['formId']) && $args['formId'] !== '' ? (string) $args['formId'] : null,
            'partnerNumber' => isset($args['partnerNumber']) && $args['partnerNumber'] !== '' ? (string) $args['partnerNumber'] : null,
            'pages' => isset($args['pages']) && is_numeric($args['pages']) ? (int) $args['pages'] : null,
            'amendedK1' => isset($args['amendedK1']) ? (bool) $args['amendedK1'] : false,
            'finalK1' => isset($args['finalK1']) ? (bool) $args['finalK1'] : false,
            'taxYearBeginning' => isset($args['taxYearBeginning']) && $args['taxYearBeginning'] !== '' ? (string) $args['taxYearBeginning'] : null,
            'taxYearEnding' => isset($args['taxYearEnding']) && $args['taxYearEnding'] !== '' ? (string) $args['taxYearEnding'] : null,
            'fields' => $fields,
            'codes' => $codes,
            'k3' => ['sections' => $k3Sections],
            'raw_text' => isset($args['raw_text']) ? (string) $args['raw_text'] : null,
            'warnings' => $warnings,
            'extraction' => [
                'model' => 'gemini',
                'version' => '2026.1',
                'timestamp' => now()->toIso8601String(),
                'source' => 'ai',
            ],
            'createdAt' => now()->toIso8601String(),
        ];

        if ($statementA !== null) {
            $result['statementA'] = $statementA;
        }

        // Passive activities (Box 23 = true supplemental statement)
        $rawPas = $args['passive_activities'] ?? [];
        if (is_array($rawPas) && count($rawPas) > 0) {
            $passiveActivities = [];
            foreach ($rawPas as $pa) {
                if (! is_array($pa) || ! isset($pa['name'])) {
                    continue;
                }
                $income = is_numeric($pa['current_income'] ?? null) ? (float) $pa['current_income'] : 0.0;
                $loss = is_numeric($pa['current_loss'] ?? null) ? (float) $pa['current_loss'] : 0.0;
                $passiveActivities[] = [
                    'name' => (string) $pa['name'],
                    'currentIncome' => max(0.0, $income),
                    'currentLoss' => min(0.0, $loss),
                ];
            }
            if (count($passiveActivities) > 0) {
                $result['passiveActivities'] = $passiveActivities;
            }
        }

        return $result;
    }

    /**
     * Normalize a raw array of code items from the K-1 tool call.
     *
     * The tool schema defines `value` as NUMBER so Gemini returns a numeric type.
     * We stringify the value here for consistent storage in the FK1StructuredData shape
     * (K1CodeItem.value is string on the frontend).
     *
     * Each item must have a 'code' key; 'value' and 'notes' are optional.
     * Invalid items (non-array, missing 'code') are silently dropped.
     *
     * @param  array<mixed>  $rawItems
     * @return array<array{code: string, value: string, notes: string}>
     */
    private function normalizeCodeItems(array $rawItems): array
    {
        $result = [];
        foreach ($rawItems as $item) {
            if (! is_array($item) || ! isset($item['code'])) {
                continue;
            }
            $rawValue = $item['value'] ?? null;
            $result[] = [
                'code' => (string) $item['code'],
                'value' => is_numeric($rawValue) ? (string) (float) $rawValue : (string) ($rawValue ?? ''),
                'notes' => isset($item['notes']) ? (string) $item['notes'] : '',
            ];
        }

        return $result;
    }

    /**
     * Normalize a mixed bool/int/string value to a PHP bool.
     * Handles strings like "false"/"0"/"no" that PHP's (bool) cast would incorrectly treat as true.
     */
    private function parseBoolArg(mixed $raw): bool
    {
        if (is_bool($raw)) {
            return $raw;
        }
        if (is_int($raw) || is_float($raw)) {
            return $raw !== 0;
        }
        if (is_string($raw)) {
            $normalized = strtolower(trim($raw));
            if (in_array($normalized, ['false', '0', 'no', 'n', ''], true)) {
                return false;
            }
            if (in_array($normalized, ['true', '1', 'yes', 'y'], true)) {
                return true;
            }
        }

        return (bool) $raw;
    }

    private function buildW2ToolDefinition(): ToolDefinition
    {
        return new ToolDefinition(
            self::TAX_DOCUMENT_W2_TOOL_NAME,
            'Extract all box values from a W-2 or W-2c tax form.',
            Schema::object([
                'employer_name' => Schema::string(),
                'employer_ein' => Schema::string(),
                'employee_name' => Schema::string(),
                'employee_ssn_last4' => Schema::string(),
                'box1_wages' => Schema::number(),
                'box2_fed_tax' => Schema::number(),
                'box3_ss_wages' => Schema::number(),
                'box4_ss_tax' => Schema::number(),
                'box5_medicare_wages' => Schema::number(),
                'box6_medicare_tax' => Schema::number(),
                'box7_ss_tips' => Schema::number(),
                'box8_allocated_tips' => Schema::number(),
                'box10_dependent_care' => Schema::number(),
                'box11_nonqualified' => Schema::number(),
                'box12_codes' => Schema::arrayOf(
                    Schema::object(
                        ['code' => Schema::string(), 'amount' => Schema::number()],
                        ['code', 'amount'],
                    )
                ),
                'box13_statutory' => Schema::boolean(),
                'box13_retirement' => Schema::boolean(),
                'box13_sick_pay' => Schema::boolean(),
                'box14_other' => Schema::arrayOf(
                    Schema::object(
                        ['label' => Schema::string(), 'amount' => Schema::number()],
                        ['label', 'amount'],
                    )
                ),
                'box15_state' => Schema::string(),
                'box16_state_wages' => Schema::number(),
                'box17_state_tax' => Schema::number(),
                'box18_local_wages' => Schema::number(),
                'box19_local_tax' => Schema::number(),
                'box20_locality' => Schema::string(),
            ]),
        );
    }

    private function build1099IntToolDefinition(): ToolDefinition
    {
        return new ToolDefinition(
            self::TAX_DOCUMENT_1099INT_TOOL_NAME,
            'Extract all box values from a 1099-INT interest income form.',
            Schema::object([
                'payer_name' => Schema::string(),
                'payer_tin' => Schema::string(),
                'recipient_name' => Schema::string(),
                'recipient_tin_last4' => Schema::string(),
                'box1_interest' => Schema::number(),
                'box2_early_withdrawal' => Schema::number(),
                'box3_savings_bond' => Schema::number(),
                'box4_fed_tax' => Schema::number(),
                'box5_investment_expense' => Schema::number(),
                'box6_foreign_tax' => Schema::number(),
                'box7_foreign_country' => Schema::string(),
                'box8_tax_exempt' => Schema::number(),
                'box9_private_activity' => Schema::number(),
                'box10_market_discount' => Schema::number(),
                'box11_bond_premium' => Schema::number(),
                'box12_treasury_premium' => Schema::number(),
                'box13_tax_exempt_premium' => Schema::number(),
                'account_number' => Schema::string(),
            ]),
        );
    }

    private function build1099DivToolDefinition(): ToolDefinition
    {
        return new ToolDefinition(
            self::TAX_DOCUMENT_1099DIV_TOOL_NAME,
            'Extract all box values from a 1099-DIV dividends and distributions form.',
            Schema::object([
                'payer_name' => Schema::string(),
                'recipient_name' => Schema::string(),
                'recipient_tin_last4' => Schema::string(),
                'payer_tin' => Schema::string(),
                'box1a_ordinary' => Schema::number(),
                'box1b_qualified' => Schema::number(),
                'box2a_cap_gain' => Schema::number(),
                'box2b_unrecap_1250' => Schema::number(),
                'box2c_section_1202' => Schema::number(),
                'box2d_collectibles' => Schema::number(),
                'box2e_section_897_ordinary' => Schema::number(),
                'box2f_section_897_cap_gain' => Schema::number(),
                'box3_nondividend' => Schema::number(),
                'box4_fed_tax' => Schema::number(),
                'box5_section_199a' => Schema::number(),
                'box6_investment_expense' => Schema::number(),
                'box7_foreign_tax' => Schema::number(),
                'box8_foreign_country' => Schema::string(),
                'box9_cash_liquidation' => Schema::number(),
                'box10_noncash_liquidation' => Schema::number(),
                'box11_exempt_interest' => Schema::number(),
                'box12_private_activity' => Schema::number(),
                'box13_state' => Schema::string(),
                'box14_state_tax' => Schema::number(),
                'account_number' => Schema::string(),
            ]),
        );
    }

    private function build1099MiscToolDefinition(): ToolDefinition
    {
        return new ToolDefinition(
            self::TAX_DOCUMENT_1099MISC_TOOL_NAME,
            'Extract all box values from a 1099-MISC miscellaneous income form.',
            Schema::object([
                'payer_name' => Schema::string(),
                'payer_tin' => Schema::string(),
                'recipient_name' => Schema::string(),
                'recipient_tin_last4' => Schema::string(),
                'account_number' => Schema::string(),
                'box1_rents' => Schema::number(),
                'box2_royalties' => Schema::number(),
                'box3_other_income' => Schema::number(),
                'box4_fed_tax' => Schema::number(),
                'box5_fishing_boat' => Schema::number(),
                'box6_medical' => Schema::number(),
                'box7_direct_sales_indicator' => Schema::boolean(),
                'box8_substitute_payments' => Schema::number(),
                'box9_crop_insurance' => Schema::number(),
                'box10_gross_proceeds_attorney' => Schema::number(),
                'box11_fish_purchased' => Schema::number(),
                'box12_section_409a_deferrals' => Schema::number(),
                'box13_fatca_filing' => Schema::string(),
                'box14_excess_golden_parachute' => Schema::number(),
                'box15_nonqualified_deferred' => Schema::number(),
                'box15_state' => Schema::string(),
                'box16_state_tax' => Schema::number(),
            ]),
        );
    }

    /**
     * Build the Gemini tool definition for extracting Schedule K-1 (Form 1065) data.
     *
     * Produces structured output (schemaVersion "2026.1"):
     *   - fields: all flat boxes A–O and 1–10, 12 (keyed by box identifier)
     *   - codes:  coded boxes 11, 13–20 (each an array of {code, value, notes})
     *   - k3_sections: Schedule K-3 foreign-source data (flattened for tool compat)
     *
     * The PHP coerce function assembles this into the canonical FK1StructuredData shape.
     *
     * Future extension: When Form 1116 (Foreign Tax Credit) support is added:
     * - Map Box 16 codes I/J (foreign taxes paid/withheld) to Form 1116 Part I.
     * - Use box16_country (code A) for the foreign country name.
     * - See IRS Publication 514 for Form 1116 computation rules.
     */
    private function buildK1ToolDefinition(): ToolDefinition
    {
        $codeItemsProp = Schema::arrayOf(
            Schema::object(
                [
                    'code' => Schema::string(),
                    'value' => Schema::string(),
                    'notes' => Schema::string(),
                ],
                ['code', 'value'],
            )
        );
        $k3SectionProp = Schema::arrayOf(
            Schema::object(
                [
                    'sectionId' => Schema::string(),
                    'title' => Schema::string(),
                    'notes' => Schema::string(),
                ],
                ['sectionId', 'title'],
            )
        );

        return new ToolDefinition(
            self::TAX_DOCUMENT_K1_TOOL_NAME,
            'Extract all boxes, codes, and K-3 sections from a Schedule K-1 (Form 1065, 1120-S, or 1041). Returns structured data keyed by box identifier.',
            Schema::object([
                // ── Identification ────────────────────────────────────────────────
                'formType' => Schema::string(),   // "K-1-1065" | "K-1-1120S" | "K-1-1041"
                'formId' => Schema::string(),   // e.g. "AQR-DELPHI-1693-2025"
                'partnerNumber' => Schema::string(),   // e.g. "1693"
                'pages' => Schema::number(),
                'amendedK1' => Schema::boolean(),
                'finalK1' => Schema::boolean(),
                'taxYearBeginning' => Schema::string(),   // YYYY-MM-DD
                'taxYearEnding' => Schema::string(),   // YYYY-MM-DD

                // ── Left-panel fields (A–O): entity & partner identification ─────
                'field_A' => Schema::string(),   // Partnership EIN
                'field_B' => Schema::string(),   // Partnership name/address (multiline)
                'field_C' => Schema::string(),   // IRS Center (Ogden / Kansas City / Cincinnati)
                'field_D' => Schema::boolean(),  // PTP indicator (checkbox)
                'field_E' => Schema::string(),   // Partner identifying number
                'field_F' => Schema::string(),   // Partner name/address (multiline)
                'field_G' => Schema::string(),   // Partner type (General / LLC / Limited)
                'field_H1' => Schema::string(),   // Domestic or Foreign
                'field_H2' => Schema::boolean(),  // Foreign U.S. person checkbox
                'field_I1' => Schema::string(),   // Profit share beginning/end
                'field_I2' => Schema::string(),   // Loss share beginning/end
                'field_I3' => Schema::string(),   // Capital share beginning/end
                'field_M' => Schema::string(),   // Tax basis capital
                'field_N' => Schema::string(),   // At-risk amount
                'field_O' => Schema::string(),   // Qualified liability

                // ── Item J: Profit/Loss/Capital percentages ───────────────────────
                'field_J_profit_beginning' => Schema::number(),
                'field_J_profit_ending' => Schema::number(),
                'field_J_loss_beginning' => Schema::number(),
                'field_J_loss_ending' => Schema::number(),
                'field_J_capital_beginning' => Schema::number(),
                'field_J_capital_ending' => Schema::number(),

                // ── Item K: Partner's share of liabilities ───────────────────────
                'field_K_recourse_beginning' => Schema::number(),
                'field_K_recourse_ending' => Schema::number(),
                'field_K_nonrecourse_beginning' => Schema::number(),
                'field_K_nonrecourse_ending' => Schema::number(),
                'field_K_qual_nonrecourse_beginning' => Schema::number(),
                'field_K_qual_nonrecourse_ending' => Schema::number(),

                // ── Item L: Capital account analysis ─────────────────────────────
                'field_L_beginning_capital' => Schema::number(),
                'field_L_contributed' => Schema::number(),
                'field_L_current_year_net' => Schema::number(),
                'field_L_other_increase' => Schema::number(),
                'field_L_withdrawals' => Schema::number(),
                'field_L_ending_capital' => Schema::number(),
                'field_L_capital_method' => Schema::string(),  // "TAX_BASIS" | "GAAP" | "SECTION_704B" | "OTHER"

                // ── Right-panel fields (1–10, 12, 21): numeric income/deduction boxes ─
                'field_1' => Schema::number(),   // Ordinary business income (loss)
                'field_2' => Schema::number(),   // Net rental real estate income (loss)
                'field_3' => Schema::number(),   // Other net rental income (loss)
                'field_4' => Schema::number(),   // Guaranteed payments (total)
                'field_4a' => Schema::number(),   // GP – services
                'field_4b' => Schema::number(),   // GP – capital
                'field_4c' => Schema::number(),   // GP – total
                'field_5' => Schema::number(),   // Interest income
                'field_6a' => Schema::number(),   // Ordinary dividends
                'field_6b' => Schema::number(),   // Qualified dividends
                'field_6c' => Schema::number(),   // Dividend equivalents
                'field_7' => Schema::number(),   // Royalties
                'field_8' => Schema::number(),   // Net short-term capital gain (loss)
                'field_9a' => Schema::number(),   // Net long-term capital gain (loss)
                'field_9b' => Schema::number(),   // Collectibles (28%) gain (loss)
                'field_9c' => Schema::number(),   // Unrecaptured Sec. 1250 gain
                'field_10' => Schema::number(),   // Net section 1231 gain (loss)
                'field_12' => Schema::number(),   // Section 179 deduction
                'field_21' => Schema::number(),   // Foreign taxes paid or accrued

                // ── Coded boxes (11, 13–20): arrays of {code, value, notes} ──────
                'codes_11' => $codeItemsProp,  // Other income (loss)
                'codes_13' => $codeItemsProp,  // Other deductions
                'codes_14' => $codeItemsProp,  // Self-employment earnings
                'codes_15' => $codeItemsProp,  // Credits
                'codes_16' => $codeItemsProp,  // Foreign transactions
                'codes_17' => $codeItemsProp,  // AMT items
                'codes_18' => $codeItemsProp,  // Tax-exempt & nondeductible
                'codes_19' => $codeItemsProp,  // Distributions
                'codes_20' => $codeItemsProp,  // Other information

                // ── §199A Statement A (attached to Box 20 Code Z, TY 2023+) ─────────
                // Populate this object when the K-1 includes a Section 199A Statement A.
                // The qualified_business_income field should match the Box 20 Code Z dollar amount.
                'statement_a' => Schema::object(
                    [
                        'trade_name' => Schema::string('Name of the trade or business from Statement A header'),
                        'qualified_business_income' => Schema::number('QBI income (loss) — matches Box 20 Code Z value'),
                        'w2_wages' => Schema::number('W-2 wages paid by the entity (used for W-2 wage limitation on Form 8995-A)'),
                        'ubia' => Schema::number('Unadjusted Basis Immediately After Acquisition of qualified property'),
                        'reit_dividends' => Schema::number('§199A(e)(3) REIT dividends allocated to partner'),
                        'ptp_income' => Schema::number('§199A(e)(5) qualified PTP income'),
                        'is_sstb' => Schema::boolean('True if this is a Specified Service Trade or Business (SSTB)'),
                    ],
                    ['qualified_business_income'],
                ),

                // ── Schedule K-3 (backward-compat fallback) ───────────────────────
                'k3_sections' => $k3SectionProp,

                // ── Schedule K-3 Part I checkboxes ────────────────────────────────
                'k3_part1_checkboxes' => Schema::arrayOf(
                    Schema::object(
                        [
                            'box' => Schema::string(),
                            'checked' => Schema::boolean(),
                            'note' => Schema::string(),
                        ],
                        ['box', 'checked'],
                    )
                ),

                // ── Schedule K-3 Part II rows (one per line+country combination) ──
                'k3_part2_rows' => Schema::arrayOf(
                    Schema::object(
                        [
                            'line' => Schema::string(),
                            'country' => Schema::string(),
                            'col_a_us_source' => Schema::number(),
                            'col_b_foreign_branch' => Schema::number(),
                            'col_c_passive' => Schema::number(),
                            'col_d_general' => Schema::number(),
                            'col_e_other_901j' => Schema::number(),
                            'col_f_sourced_by_partner' => Schema::number(),
                            'col_g_total' => Schema::number(),
                            'note' => Schema::string(),
                        ],
                        ['line', 'country'],
                    )
                ),

                // ── Schedule K-3 Part III Section 2: asset apportionment rows ─────
                'k3_part3_asset_rows' => Schema::arrayOf(
                    Schema::object(
                        [
                            'line' => Schema::string(),
                            'col_a_us_source' => Schema::number(),
                            'col_b_foreign_branch' => Schema::number(),
                            'col_c_passive' => Schema::number(),
                            'col_d_general' => Schema::number(),
                            'col_f_sourced_by_partner' => Schema::number(),
                            'col_g_total' => Schema::number(),
                        ],
                        ['line'],
                    )
                ),

                // ── Schedule K-3 Part III Section 4: foreign taxes by country ─────
                'k3_part3_foreign_taxes' => Schema::arrayOf(
                    Schema::object(
                        [
                            'country' => Schema::string(),
                            'tax_type' => Schema::string(),   // "WHTD" | "PAID" | "ACCRUED"
                            'basket' => Schema::string(),   // "passive" | "general" | "branch" | "951A"
                            'amount_usd' => Schema::number(),
                            'amount_foreign_currency' => Schema::number(),
                            'exchange_rate' => Schema::number(),
                            'date_paid' => Schema::string(),
                        ],
                        ['country', 'amount_usd'],
                    )
                ),

                // ── Schedule K-3 Part I Box 4: FX translation table ───────────────
                'k3_part1_fx_translation' => Schema::arrayOf(
                    Schema::object(
                        [
                            'country' => Schema::string(),
                            'date_paid' => Schema::string(),
                            'exchange_rate' => Schema::number(),
                            'amount_foreign_currency' => Schema::number(),
                            'amount_usd' => Schema::number(),
                        ],
                        ['country', 'amount_usd'],
                    )
                ),

                // ── Schedule K-3 Part III Section 5: Sec. 743(b) basis adjustments ─
                'k3_part3_section5_sec743b_positive' => Schema::number('Positive Sec. 743(b) basis adjustment amount from Part III Section 5'),
                'k3_part3_section5_sec743b_negative' => Schema::number('Negative Sec. 743(b) basis adjustment amount from Part III Section 5'),

                // ── Schedule K-3 Part IV: FDII and Sec. 250 deduction ─────────────
                'k3_part4_net_income_loss' => Schema::number('Net income or loss from Part IV (FDII / Sec. 250 deduction)'),
                'k3_part4_dei_gross_receipts' => Schema::number('Deduction eligible income (DEI) — gross receipts from Part IV'),
                'k3_part4_dei_allocated_deductions' => Schema::number('DEI — allocated deductions from Part IV'),
                'k3_part4_other_interest_expense_dei' => Schema::number('Other interest expense allocable to DEI from Part IV'),
                'k3_part4_total_average_assets' => Schema::number('Total average assets reported in Part IV'),

                // ── Schedule K-3 Part IX key numeric fields ───────────────────────
                'k3_part9_line1_gross_receipts' => Schema::number('Part IX Line 1 — gross receipts from a foreign partnership for Sec. 954(c)(3) exclusion'),
                'k3_part9_line5_denominator_amounts' => Schema::number('Part IX Line 5 — denominator amounts for tax-exempt income computation'),

                // ── Schedule K-3 Parts V–XIII free-form notes ─────────────────────
                'k3_part5_notes' => Schema::string('Summarize any notable amounts or elections in K-3 Part V (distributions from foreign corporations)'),
                'k3_part6_notes' => Schema::string('Summarize any Sec. 951(a)(1) or Sec. 951A inclusions reported in K-3 Part VI'),
                'k3_part7_notes' => Schema::string('Summarize any Sec. 951A GILTI inclusions reported in K-3 Part VII'),
                'k3_part8_notes' => Schema::string('Summarize any alternative transition-year calculation details from K-3 Part VIII'),
                'k3_part9_notes' => Schema::string('Summarize key tax-exempt income amounts and elections from K-3 Part IX'),
                'k3_part10_notes' => Schema::string('Summarize character and source of income/deductions for foreign partners from K-3 Part X'),
                'k3_part11_notes' => Schema::string('Summarize deemed sale items on transfer reported in K-3 Part XI'),
                'k3_part12_notes' => Schema::string('Summarize BEAT-related partner information from K-3 Part XII'),
                'k3_part13_notes' => Schema::string('Summarize ECTI distributive share amounts for foreign partners from K-3 Part XIII'),

                // ── Schedule K-3 parts applicability checkboxes ───────────────────
                'k3_parts_applicable' => Schema::object([
                    'part1' => Schema::boolean(), 'part2' => Schema::boolean(), 'part3' => Schema::boolean(),
                    'part4' => Schema::boolean(), 'part5' => Schema::boolean(), 'part6' => Schema::boolean(),
                    'part7' => Schema::boolean(), 'part8' => Schema::boolean(), 'part9' => Schema::boolean(),
                    'part10' => Schema::boolean(), 'part11' => Schema::boolean(), 'part12' => Schema::boolean(),
                    'part13' => Schema::boolean(),
                ]),

                // ── K-3 general notes ─────────────────────────────────────────────
                'k3_notes' => Schema::arrayOf(Schema::string()),

                // ── Partnership classification overrides ──────────────────────────
                // Set to true when the K-1 or attached statements indicate the
                // partnership is a "Trader in Securities" (neither portfolio nor passive).
                // Trader funds are nonpassive by definition regardless of partner type.
                'field_partnershipPosition_traderInSecurities' => Schema::boolean('True when the K-1 or attached statements indicate the partnership is a Trader in Securities (neither portfolio nor passive). Trader funds are nonpassive regardless of whether the taxpayer is a limited partner.'),

                // ── Passive activities (Box 23 = true) ───────────────────────────
                // When Box 23 (more than one activity is passive) is checked, the
                // partnership attaches a supplemental statement listing each passive
                // activity with its current-year net income or loss.  Extract each
                // activity here so Form 8582 can be computed correctly.  Each entry
                // maps to one row in Form 8582 Part V.
                'passive_activities' => Schema::arrayOf(
                    Schema::object(
                        'One passive activity from the partnership supplemental statement.',
                        [
                            'name' => Schema::string('Activity description from the supplemental statement (e.g. "Section 1256 contracts activity", "Trading activity — passive").'),
                            'current_income' => Schema::number('Net current-year income from this activity (positive number, or 0 if the activity has a net loss).'),
                            'current_loss' => Schema::number('Net current-year loss from this activity (negative number, or 0 if the activity has net income).'),
                        ],
                    )
                ),

                // ── Supplemental text & metadata ─────────────────────────────────
                'raw_text' => Schema::string(),
                'warnings' => Schema::arrayOf(Schema::string()),
            ]),
        );
    }
}
