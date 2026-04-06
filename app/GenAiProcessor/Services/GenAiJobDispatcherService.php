<?php

namespace App\GenAiProcessor\Services;

use App\GenAiProcessor\Models\GenAiDailyQuota;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\User;
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
     * Build the Gemini prompt for the given job type and context.
     */
    public function buildPrompt(string $jobType, array $context): string
    {
        return match ($jobType) {
            'finance_transactions' => $this->buildFinanceTransactionsPrompt($context),
            'finance_payslip' => $this->buildPayslipPrompt($context),
            'utility_bill' => $this->buildUtilityBillPrompt($context),
            'tax_document' => $this->buildTaxDocumentPrompt($context),
            default => throw new \InvalidArgumentException("Unknown job type: {$jobType}"),
        };
    }

    /**
     * Build the Gemini generateContent payload for the given job type.
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
            $payload['tools'] = [[
                'function_declarations' => [$this->buildFinanceAccountToolDefinition()],
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
                    'function_declarations' => [$toolDef['definition']],
                ]];
                $payload['toolConfig'] = [
                    'functionCallingConfig' => [
                        'mode' => 'ANY',
                        'allowedFunctionNames' => [$toolDef['name']],
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
     */
    public function extractGenerateContentData(string $jobType, array $responseBody): ?array
    {
        if ($jobType === 'finance_transactions') {
            return $this->extractFinanceGenerateContentData($responseBody);
        }

        if ($jobType === 'tax_document') {
            return $this->extractTaxDocumentGenerateContentData($responseBody);
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

    private function buildFinanceTransactionsPrompt(array $context): string
    {
        $accountsContext = $context['accounts'] ?? [];

        $accountsSection = '';
        if (! empty($accountsContext)) {
            $lines = array_map(
                fn ($a) => "- {$a['name']}: last 4 digits {$a['last4']}",
                $accountsContext
            );
            $accountsSection = "\n\nKnown user accounts (use these to assign transactions to the correct account):\n".implode("\n", $lines);
        }

        return <<<PROMPT
Analyze the provided bank or brokerage statement PDF and extract investor-level account data only. Use the `addFinanceAccount` tool once per account. If tool use is unavailable, return ONLY valid JSON as `{"accounts":[ACCOUNT,...]}` where each `ACCOUNT` matches the tool payload below.{$accountsSection}

ACCOUNT schema:
- `statementInfo`: object with optional `brokerName`, `accountNumber`, `accountName`, `periodStart`, `periodEnd`, `closingBalance`
- `statementDetails[]`: `{ "section": string, "line_item": string, "statement_period_value": number, "ytd_value": number, "is_percentage": boolean }`
- `transactions[]`: `{ "date": "YYYY-MM-DD", "description": string, "amount": number, "type"?: string, "symbol"?: string|null, "quantity"?: number|null, "price"?: number|null, "commission"?: number, "fee"?: number }`
- `lots[]`: `{ "symbol": string, "description"?: string, "quantity": number, "purchaseDate": "YYYY-MM-DD", "costBasis": number, "costPerUnit"?: number, "marketValue"?: number, "unrealizedGainLoss"?: number, "saleDate"?: "YYYY-MM-DD", "proceeds"?: number, "realizedGainLoss"?: number }`

Rules:
1. Extract only partner-level or investor-level data. Exclude fund-level sections such as "Fund Level Capital Account", "Fund Level Summary", "Statement of Operations", "Statement of Cash Flows", "Statement of Assets & Liabilities", and "Statement of Changes in Partners' Capital".
2. Always use the unified multi-account shape: `{ "accounts": [ACCOUNT, ...] }`. If a section is missing, return an empty array for that section.
3. Statement detail section mappings: "Statement Summary (Dollars)" → "Statement Summary (\$)", "Statement Summary (Percent)" → "Statement Summary (%)", "Investor Capital Account Detail" → "Investor Capital Account", "Tax and Pre Tax Return Detail (Dollars)" → "Tax and Pre-Tax Return Detail (\$)", "Tax and Pre Tax Return Detail (Percent)" → "Tax and Pre-Tax Return Detail (%)".
4. Statement detail line-item mappings: "Pre - Tax Return" → "Pre-Tax Return", "Post - Tax Return" → "Post-Tax Return", "Net Contributions / Withdrawals" → "Net Contributions/Withdrawals", "Mgt Fee" → "Management Fee", "Incentive Fee" → "Incentive Allocation", "Total Pre-Tax Fees" → "Total Fees", "Realized Gain (Loss)" → "Realized Gain/Loss", "Unrealized Gain (Loss)" → "Unrealized Gain/Loss", "Change In Unrealized" → "Change in Unrealized".
5. Extract dated transactions such as deposits, withdrawals, trades, dividends, and interest. Populate `symbol` for stock-related transactions; infer the well-known ticker when the company name is clear and no ticker is shown.
6. Extract lot-level data for both open and closed positions. Open lots include `marketValue` and `unrealizedGainLoss`; closed lots include `saleDate`, `proceeds`, and `realizedGainLoss`. Normalize Purchase Date, Acquisition Date, and Invt. Date to `purchaseDate`.
7. Return only valid JSON / tool arguments. Normalize all dates to `YYYY-MM-DD`, convert parentheses to negative numbers, strip footnote superscripts, normalize spacing, and output numeric fields as numbers.
PROMPT;
    }

    private function buildFinanceAccountToolDefinition(): array
    {
        return [
            'name' => self::FINANCE_ACCOUNT_TOOL_NAME,
            'description' => 'Add one parsed finance account from a bank or brokerage statement.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'statementInfo' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'brokerName' => ['type' => 'STRING'],
                            'accountNumber' => ['type' => 'STRING'],
                            'accountName' => ['type' => 'STRING'],
                            'periodStart' => ['type' => 'STRING'],
                            'periodEnd' => ['type' => 'STRING'],
                            'closingBalance' => ['type' => 'NUMBER'],
                        ],
                    ],
                    'statementDetails' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'section' => ['type' => 'STRING'],
                                'line_item' => ['type' => 'STRING'],
                                'statement_period_value' => ['type' => 'NUMBER'],
                                'ytd_value' => ['type' => 'NUMBER'],
                                'is_percentage' => ['type' => 'BOOLEAN'],
                            ],
                            'required' => ['section', 'line_item', 'statement_period_value', 'ytd_value', 'is_percentage'],
                        ],
                    ],
                    'transactions' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'date' => ['type' => 'STRING'],
                                'description' => ['type' => 'STRING'],
                                'amount' => ['type' => 'NUMBER'],
                                'type' => ['type' => 'STRING'],
                                'symbol' => ['type' => 'STRING'],
                                'quantity' => ['type' => 'NUMBER'],
                                'price' => ['type' => 'NUMBER'],
                                'commission' => ['type' => 'NUMBER'],
                                'fee' => ['type' => 'NUMBER'],
                            ],
                            'required' => ['date', 'description', 'amount'],
                        ],
                    ],
                    'lots' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'symbol' => ['type' => 'STRING'],
                                'description' => ['type' => 'STRING'],
                                'quantity' => ['type' => 'NUMBER'],
                                'purchaseDate' => ['type' => 'STRING'],
                                'costBasis' => ['type' => 'NUMBER'],
                                'costPerUnit' => ['type' => 'NUMBER'],
                                'marketValue' => ['type' => 'NUMBER'],
                                'unrealizedGainLoss' => ['type' => 'NUMBER'],
                                'saleDate' => ['type' => 'STRING'],
                                'proceeds' => ['type' => 'NUMBER'],
                                'realizedGainLoss' => ['type' => 'NUMBER'],
                            ],
                            'required' => ['symbol', 'quantity', 'purchaseDate', 'costBasis'],
                        ],
                    ],
                ],
                'required' => ['statementInfo', 'statementDetails', 'transactions', 'lots'],
            ],
        ];
    }

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

    private function buildPayslipPrompt(array $context): string
    {
        $fileCount = $context['file_count'] ?? 1;

        return <<<PROMPT
Analyze the provided {$fileCount} payslip PDF document(s).
I have provided each file preceded by "Filename: [name]".

For EACH file, extract the following fields.
Return a SINGLE JSON ARRAY containing objects.
If a single file contains multiple payslips, create separate objects for each payslip, using the same `original_filename`.

**JSON Fields:**
- `original_filename`: The filename provided.
- `period_start`: Pay period start date (YYYY-MM-DD)
- `period_end`: Pay period end date (YYYY-MM-DD)
- `pay_date`: The date the payment was issued (YYYY-MM-DD)
- `earnings_gross`: Gross pay amount (numeric)
- `earnings_bonus`: Bonus amount, if any (numeric)
- `earnings_net_pay`: Net pay amount (numeric)
- `earnings_rsu`: Value of Restricted Stock Units (RSUs) vested, if any (numeric)
- `imp_other`: Imputed income, if any (numeric)
- `imp_legal`: Imputed income for legal services, if any (numeric)
- `imp_fitness`: Imputed income for fitness benefits, including "Life@ Choice" if any (numeric)
- `imp_ltd`: Imputed income for long-term disability, if any (numeric)
- `ps_oasdi`: Employee OASDI (Social Security) tax (numeric)
- `ps_medicare`: Employee Medicare tax (numeric)
- `ps_fed_tax`: Federal income tax withheld (numeric)
- `ps_fed_tax_addl`: Additional federal tax withheld, if any (numeric)
- `ps_state_tax`: State income tax withheld (numeric)
- `ps_state_tax_addl`: Additional state tax withheld, if any (numeric)
- `ps_state_disability`: State disability insurance deduction (numeric)
- `ps_401k_pretax`: Pre-tax 401(k) contribution (numeric)
- `ps_401k_aftertax`: After-tax/Roth 401(k) contribution (numeric)
- `ps_401k_employer`: Employer 401(k) contribution (numeric)
- `ps_pretax_medical`: Pre-tax medical deduction (numeric)
- `ps_pretax_dental`: Pre-tax dental deduction (numeric)
- `ps_pretax_vision`: Pre-tax vision deduction (numeric)
- `ps_pretax_fsa`: Pre-tax Flexible Spending Account (FSA) deduction (numeric)
- `ps_salary`: Salary amount for the period (numeric)
- `ps_vacation_payout`: Payout for unused vacation time, if any (numeric)
- `ps_comment`: Any notes or comments.

**Instructions:**
1.  Return the data in a clean JSON format. Do not include any explanatory text outside of the JSON structure.
2.  If a field is not present in the document, omit it from the JSON or set its value to `null`.
3.  All monetary values should be numbers (e.g., `1234.56`).
4.  All dates must be in `YYYY-MM-DD` format.

PROMPT;
    }

    private function buildUtilityBillPrompt(array $context): string
    {
        $accountType = $context['account_type'] ?? 'General';
        $fileCount = $context['file_count'] ?? 1;

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
- `discounts`: Total discounts applied to the bill (numeric, in dollars). Only include realized discounts, not potential ones.
- `credits`: Total credits applied to the bill (numeric, in dollars)
- `payments_received`: Total payments received during the period (numeric, in dollars)
- `previous_unpaid_balance`: Previous unpaid balance carried over (numeric, in dollars)
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

    private function buildTaxDocumentPrompt(array $context): string
    {
        $formType = $context['form_type'] ?? 'w2';
        $taxYear = $context['tax_year'] ?? date('Y');

        return match (true) {
            in_array($formType, ['w2', 'w2c']) => $this->buildW2Prompt($formType, (int) $taxYear),
            in_array($formType, ['1099_int', '1099_int_c']) => $this->build1099IntPrompt($formType, (int) $taxYear),
            in_array($formType, ['1099_div', '1099_div_c']) => $this->build1099DivPrompt($formType, (int) $taxYear),
            $formType === '1099_misc' => $this->build1099MiscPrompt((int) $taxYear),
            $formType === 'k1' => $this->buildK1Prompt((int) $taxYear),
            default => throw new \InvalidArgumentException("Unknown tax form type: {$formType}"),
        };
    }

    private function buildW2Prompt(string $formType, int $taxYear): string
    {
        $formName = $formType === 'w2c' ? 'W-2c (Corrected Wage and Tax Statement)' : 'W-2 (Wage and Tax Statement)';
        $toolName = self::TAX_DOCUMENT_W2_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Analyze the provided {$formName} PDF for tax year {$taxYear}.
Use the `{$toolName}` tool to return ALL extracted box values from the form.
All monetary values must be numbers (not strings). If a field is not present on the form, set it to null.
For Box 12, return an empty array if no codes are present. For Box 14, return an empty array if nothing is listed.
PROMPT;
    }

    private function build1099IntPrompt(string $formType, int $taxYear): string
    {
        $formName = $formType === '1099_int_c' ? '1099-INT (Corrected)' : '1099-INT';
        $toolName = self::TAX_DOCUMENT_1099INT_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Analyze the provided {$formName} PDF for tax year {$taxYear}.
Use the `{$toolName}` tool to return ALL extracted box values from the Interest Income form.
All monetary values must be numbers (not strings). If a field is not present on the form, set it to null.
PROMPT;
    }

    private function build1099DivPrompt(string $formType, int $taxYear): string
    {
        $formName = $formType === '1099_div_c' ? '1099-DIV (Corrected)' : '1099-DIV';
        $toolName = self::TAX_DOCUMENT_1099DIV_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Analyze the provided {$formName} PDF for tax year {$taxYear}.
Use the `{$toolName}` tool to return ALL extracted box values from the Dividends and Distributions form.
All monetary values must be numbers (not strings). If a field is not present on the form, set it to null.
PROMPT;
    }

    private function build1099MiscPrompt(int $taxYear): string
    {
        $toolName = self::TAX_DOCUMENT_1099MISC_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Analyze the provided 1099-MISC PDF for tax year {$taxYear}.
Use the `{$toolName}` tool to return ALL extracted box values from the Miscellaneous Income form.
All monetary values must be numbers (not strings). If a field is not present on the form, set it to null.
PROMPT;
    }

    /**
     * Build the AI prompt for extracting Schedule K-1 data.
     *
     * The tool definition carries all the structural detail, so the prompt can be concise.
     * Structured output (schemaVersion "2026.1") is stored directly in parsed_data.
     *
     * Future extension: Box 16 (foreign transactions) feeds into Form 1116 when that support is added.
     */
    private function buildK1Prompt(int $taxYear): string
    {
        $toolName = self::TAX_DOCUMENT_K1_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Extract ALL data from this Schedule K-1 PDF (tax year {$taxYear}) using the `{$toolName}` tool.
This document may include the K-1 face page, supporting statements, and a multi-page Schedule K-3.

EXTRACTION RULES:

1. FLAT FIELDS (fields A–O, boxes 1–10, 12, 14, 21):
   Extract every labeled field. Use null for absent fields. Numbers must be numeric (not strings).
   Negative amounts shown in parentheses like (1,234) must be returned as -1234.
   Box 21 (foreign taxes paid or accrued) is a direct numeric field, not a coded box.

2. CODED BOXES (11, 13–20):
   Each code entry becomes a SEPARATE array item even if the same code appears multiple times.
   CRITICAL: When a box has multiple sub-items under the same code (e.g., Box 11 Code ZZ
   contains three distinct items: §988 loss, swap loss, PFIC income), create one array entry
   per sub-item with its individual dollar amount and a descriptive note.
   Example: three Box 11 ZZ entries with values -23167, -54237, and 3198 respectively.
   The `notes` field must include: (a) what the item is, (b) its tax character
   (ordinary vs. capital), and (c) where it goes on the return (e.g., "Schedule E Part II
   nonpassive" or "Schedule D"). Quote the K-1 footnote verbatim when it specifies treatment.

3. SUPPORTING STATEMENTS:
   Read ALL supplemental pages. Box totals on the face page are often aggregates;
   the breakdown is in the supporting statements. Always prefer the line-item detail
   over the face-page total when both are present.

4. SCHEDULE K-3 — PART II (Foreign Tax Credit Limitation):
   This is the most structurally complex section. Extract EVERY row from EVERY table.
   For each K-3 line (6–24 for income, 25–55 for deductions), capture every country
   row as a separate entry with its 7-column breakdown:
     (a) U.S. source, (b) Foreign branch, (c) Passive category,
     (d) General category, (e) Other 901j, (f) Sourced by partner, (g) Total.
   The country code is a 2-letter IRS code (US, AS, BE, CA, etc.) or XX for
   "sourced by partner" items. Include the section totals (lines 24, 54, 55).

5. SCHEDULE K-3 — PART III (Form 1116 Apportionment):
   Section 2 (interest expense apportionment): extract all 8 asset rows with their
   7-column breakdown. Record the passive asset ratio (passive assets / total assets).
   Section 4 (foreign taxes): extract each country with tax type (WHTD = withholding),
   amount paid, and which basket (passive/general/branch) it falls into.
   Section 1 (Part I Box 4 FX translation): if present, extract the exchange rate table
   showing each country's foreign currency amount, exchange rate, and USD equivalent.

6. SCHEDULE K-3 — OTHER PARTS:
   For Parts IV–XIII, note which parts apply (checkbox). Capture any numeric data present.
   Most will be blank (N/A). Record that fact in a warning if Parts unexpectedly have data.

7. WARNINGS:
   Add a warning string for: (a) any item whose tax character is ambiguous,
   (b) any K-3 section that has data but couldn't be fully parsed,
   (c) any footnote that overrides standard treatment (e.g., "report on Schedule E,
   not Schedule D" for swap losses).

8. NORMALIZATION:
   - All monetary values: numbers, never strings. Parentheses = negative.
   - All percentages: store as decimal (e.g., 0.042400 not 4.2400).
   - All dates: YYYY-MM-DD.
   - Partner number / form ID: capture from header if present.
PROMPT;
    }

    /**
     * Extracts the tool name marker from the prompt and returns the tool definition.
     * Returns null if no marker is found.
     *
     * @return array{name: string, definition: array}|null
     */
    private function buildTaxDocumentToolDefinitionFromPrompt(string $prompt): ?array
    {
        if (str_contains($prompt, self::TAX_DOCUMENT_W2_TOOL_NAME)) {
            return ['name' => self::TAX_DOCUMENT_W2_TOOL_NAME, 'definition' => $this->buildW2ToolDefinition()];
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099INT_TOOL_NAME)) {
            return ['name' => self::TAX_DOCUMENT_1099INT_TOOL_NAME, 'definition' => $this->build1099IntToolDefinition()];
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099DIV_TOOL_NAME)) {
            return ['name' => self::TAX_DOCUMENT_1099DIV_TOOL_NAME, 'definition' => $this->build1099DivToolDefinition()];
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_1099MISC_TOOL_NAME)) {
            return ['name' => self::TAX_DOCUMENT_1099MISC_TOOL_NAME, 'definition' => $this->build1099MiscToolDefinition()];
        }
        if (str_contains($prompt, self::TAX_DOCUMENT_K1_TOOL_NAME)) {
            return ['name' => self::TAX_DOCUMENT_K1_TOOL_NAME, 'definition' => $this->buildK1ToolDefinition()];
        }

        return null;
    }

    /**
     * Extract structured data from a tax_document Gemini tool-call response.
     * Falls back to JSON text parsing if no function call is found.
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
     */
    private function coerceK1Args(array $args): array
    {
        // Scalar field boxes (left panel A–O, right panel 1–10, 12, 21)
        $strBoxes = ['A', 'B', 'C', 'E', 'F', 'G', 'H1', 'I1', 'I2', 'I3', 'M', 'N', 'O'];
        $boolBoxes = ['D', 'H2'];
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
        $k3Sections = [];

        // Part I checkboxes
        $checkboxes = is_array($args['k3_part1_checkboxes'] ?? null) ? $args['k3_part1_checkboxes'] : [];
        $fxRows = is_array($args['k3_part1_fx_translation'] ?? null) ? $args['k3_part1_fx_translation'] : [];
        if (! empty($checkboxes) || ! empty($fxRows)) {
            $part1Data = [];
            if (! empty($checkboxes)) {
                $part1Data['checkboxes'] = $checkboxes;
            }
            if (! empty($fxRows)) {
                $part1Data['fxTranslation'] = $fxRows;
            }
            $k3Sections[] = [
                'sectionId' => 'part1',
                'title' => 'Part I – Other Current Year International Information',
                'data' => $part1Data,
                'notes' => '',
            ];
        }

        // Part II income/deduction rows — split into income (lines 6–24) and deductions (lines 25–55)
        $part2Rows = is_array($args['k3_part2_rows'] ?? null) ? $args['k3_part2_rows'] : [];
        if (! empty($part2Rows)) {
            $incomeLines = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];
            $deductionLines = ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55'];
            $section1Rows = array_values(array_filter($part2Rows, fn ($r) => in_array($r['line'] ?? '', $incomeLines)));
            $section2Rows = array_values(array_filter($part2Rows, fn ($r) => in_array($r['line'] ?? '', $deductionLines)));
            if (! empty($section1Rows)) {
                $k3Sections[] = [
                    'sectionId' => 'part2_section1',
                    'title' => 'Part II – Foreign Tax Credit Limitation, Section 1: Gross Income',
                    'data' => ['rows' => $section1Rows],
                    'notes' => '',
                ];
            }
            if (! empty($section2Rows)) {
                $k3Sections[] = [
                    'sectionId' => 'part2_section2',
                    'title' => 'Part II – Foreign Tax Credit Limitation, Section 2: Deductions',
                    'data' => ['rows' => $section2Rows],
                    'notes' => '',
                ];
            }
        }

        // Part III Section 2: interest expense apportionment asset rows
        $assetRows = is_array($args['k3_part3_asset_rows'] ?? null) ? $args['k3_part3_asset_rows'] : [];
        if (! empty($assetRows)) {
            $k3Sections[] = [
                'sectionId' => 'part3_section2',
                'title' => 'Part III – Section 2: Interest Expense Apportionment Factors',
                'data' => ['rows' => $assetRows],
                'notes' => '',
            ];
        }

        // Part III Section 4: foreign taxes by country
        $foreignTaxes = is_array($args['k3_part3_foreign_taxes'] ?? null) ? $args['k3_part3_foreign_taxes'] : [];
        if (! empty($foreignTaxes)) {
            $k3Sections[] = [
                'sectionId' => 'part3_section4',
                'title' => 'Part III – Section 4: Foreign Taxes',
                'data' => [
                    'countries' => $foreignTaxes,
                    'grandTotalUSD' => array_sum(array_column($foreignTaxes, 'amount_usd')),
                ],
                'notes' => '',
            ];
        }

        // Backward-compat: merge any legacy k3_sections entries not already covered
        $rawSections = is_array($args['k3_sections'] ?? null) ? $args['k3_sections'] : [];
        $existingIds = array_column($k3Sections, 'sectionId');
        foreach ($rawSections as $sec) {
            if (! is_array($sec) || ! isset($sec['sectionId'])) {
                continue;
            }
            if (in_array($sec['sectionId'], $existingIds)) {
                continue;
            }
            $k3Sections[] = [
                'sectionId' => (string) $sec['sectionId'],
                'title' => isset($sec['title']) ? (string) $sec['title'] : '',
                'data' => (object) [],
                'notes' => isset($sec['notes']) ? (string) $sec['notes'] : '',
            ];
        }

        // Warnings
        $rawWarnings = $args['warnings'] ?? [];
        $warnings = is_array($rawWarnings)
            ? array_values(array_filter(array_map(fn ($w) => is_string($w) ? $w : null, $rawWarnings)))
            : [];

        return [
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

    private function buildW2ToolDefinition(): array
    {
        $numberProp = fn () => ['type' => 'NUMBER'];
        $stringProp = fn () => ['type' => 'STRING'];
        $boolProp = fn () => ['type' => 'BOOLEAN'];

        return [
            'name' => self::TAX_DOCUMENT_W2_TOOL_NAME,
            'description' => 'Extract all box values from a W-2 or W-2c tax form.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'employer_name' => $stringProp(),
                    'employer_ein' => $stringProp(),
                    'employee_name' => $stringProp(),
                    'employee_ssn_last4' => $stringProp(),
                    'box1_wages' => $numberProp(),
                    'box2_fed_tax' => $numberProp(),
                    'box3_ss_wages' => $numberProp(),
                    'box4_ss_tax' => $numberProp(),
                    'box5_medicare_wages' => $numberProp(),
                    'box6_medicare_tax' => $numberProp(),
                    'box7_ss_tips' => $numberProp(),
                    'box8_allocated_tips' => $numberProp(),
                    'box10_dependent_care' => $numberProp(),
                    'box11_nonqualified' => $numberProp(),
                    'box12_codes' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'code' => $stringProp(),
                                'amount' => $numberProp(),
                            ],
                            'required' => ['code', 'amount'],
                        ],
                    ],
                    'box13_statutory' => $boolProp(),
                    'box13_retirement' => $boolProp(),
                    'box13_sick_pay' => $boolProp(),
                    'box14_other' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'label' => $stringProp(),
                                'amount' => $numberProp(),
                            ],
                            'required' => ['label', 'amount'],
                        ],
                    ],
                    'box15_state' => $stringProp(),
                    'box16_state_wages' => $numberProp(),
                    'box17_state_tax' => $numberProp(),
                    'box18_local_wages' => $numberProp(),
                    'box19_local_tax' => $numberProp(),
                    'box20_locality' => $stringProp(),
                ],
            ],
        ];
    }

    private function build1099IntToolDefinition(): array
    {
        $numberProp = fn () => ['type' => 'NUMBER'];
        $stringProp = fn () => ['type' => 'STRING'];

        return [
            'name' => self::TAX_DOCUMENT_1099INT_TOOL_NAME,
            'description' => 'Extract all box values from a 1099-INT interest income form.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'payer_name' => $stringProp(),
                    'payer_tin' => $stringProp(),
                    'recipient_name' => $stringProp(),
                    'recipient_tin_last4' => $stringProp(),
                    'box1_interest' => $numberProp(),
                    'box2_early_withdrawal' => $numberProp(),
                    'box3_savings_bond' => $numberProp(),
                    'box4_fed_tax' => $numberProp(),
                    'box5_investment_expense' => $numberProp(),
                    'box6_foreign_tax' => $numberProp(),
                    'box7_foreign_country' => $stringProp(),
                    'box8_tax_exempt' => $numberProp(),
                    'box9_private_activity' => $numberProp(),
                    'box10_market_discount' => $numberProp(),
                    'box11_bond_premium' => $numberProp(),
                    'box12_treasury_premium' => $numberProp(),
                    'box13_tax_exempt_premium' => $numberProp(),
                    'account_number' => $stringProp(),
                ],
            ],
        ];
    }

    private function build1099DivToolDefinition(): array
    {
        $numberProp = fn () => ['type' => 'NUMBER'];
        $stringProp = fn () => ['type' => 'STRING'];

        return [
            'name' => self::TAX_DOCUMENT_1099DIV_TOOL_NAME,
            'description' => 'Extract all box values from a 1099-DIV dividends and distributions form.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'payer_name' => $stringProp(),
                    'recipient_name' => $stringProp(),
                    'recipient_tin_last4' => $stringProp(),
                    'payer_tin' => $stringProp(),
                    'box1a_ordinary' => $numberProp(),
                    'box1b_qualified' => $numberProp(),
                    'box2a_cap_gain' => $numberProp(),
                    'box2b_unrecap_1250' => $numberProp(),
                    'box2c_section_1202' => $numberProp(),
                    'box2d_collectibles' => $numberProp(),
                    'box2e_section_897_ordinary' => $numberProp(),
                    'box2f_section_897_cap_gain' => $numberProp(),
                    'box3_nondividend' => $numberProp(),
                    'box4_fed_tax' => $numberProp(),
                    'box5_section_199a' => $numberProp(),
                    'box6_investment_expense' => $numberProp(),
                    'box7_foreign_tax' => $numberProp(),
                    'box8_foreign_country' => $stringProp(),
                    'box9_cash_liquidation' => $numberProp(),
                    'box10_noncash_liquidation' => $numberProp(),
                    'box11_exempt_interest' => $numberProp(),
                    'box12_private_activity' => $numberProp(),
                    'box13_state' => $stringProp(),
                    'box14_state_tax' => $numberProp(),
                    'account_number' => $stringProp(),
                ],
            ],
        ];
    }

    private function build1099MiscToolDefinition(): array
    {
        $numberProp = fn () => ['type' => 'NUMBER'];
        $stringProp = fn () => ['type' => 'STRING'];

        return [
            'name' => self::TAX_DOCUMENT_1099MISC_TOOL_NAME,
            'description' => 'Extract all box values from a 1099-MISC miscellaneous income form.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'payer_name' => $stringProp(),
                    'payer_tin' => $stringProp(),
                    'recipient_name' => $stringProp(),
                    'recipient_tin_last4' => $stringProp(),
                    'account_number' => $stringProp(),
                    'box1_rents' => $numberProp(),
                    'box2_royalties' => $numberProp(),
                    'box3_other_income' => $numberProp(),
                    'box4_fed_tax' => $numberProp(),
                    'box5_fishing_boat' => $numberProp(),
                    'box6_medical' => $numberProp(),
                    'box7_direct_sales_indicator' => ['type' => 'BOOLEAN'],
                    'box8_substitute_payments' => $numberProp(),
                    'box9_crop_insurance' => $numberProp(),
                    'box10_gross_proceeds_attorney' => $numberProp(),
                    'box11_fish_purchased' => $numberProp(),
                    'box12_section_409a_deferrals' => $numberProp(),
                    'box13_fatca_filing' => $stringProp(),
                    'box14_excess_golden_parachute' => $numberProp(),
                    'box15_nonqualified_deferred' => $numberProp(),
                    'box15_state' => $stringProp(),
                    'box16_state_tax' => $numberProp(),
                ],
            ],
        ];
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
    private function buildK1ToolDefinition(): array
    {
        $strField = fn () => ['type' => 'STRING'];
        $numField = fn () => ['type' => 'NUMBER'];
        $boolField = fn () => ['type' => 'BOOLEAN'];
        $codeItemsProp = fn () => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'code' => ['type' => 'STRING'],
                    'value' => ['type' => 'STRING'],
                    'notes' => ['type' => 'STRING'],
                ],
                'required' => ['code', 'value'],
            ],
        ];
        $k3SectionProp = fn () => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'sectionId' => ['type' => 'STRING'],
                    'title' => ['type' => 'STRING'],
                    'notes' => ['type' => 'STRING'],
                ],
                'required' => ['sectionId', 'title'],
            ],
        ];

        return [
            'name' => self::TAX_DOCUMENT_K1_TOOL_NAME,
            'description' => 'Extract all boxes, codes, and K-3 sections from a Schedule K-1 (Form 1065, 1120-S, or 1041). Returns structured data keyed by box identifier.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    // ── Identification ────────────────────────────────────────────────
                    'formType' => $strField(),   // "K-1-1065" | "K-1-1120S" | "K-1-1041"
                    'formId' => $strField(),   // e.g. "AQR-DELPHI-1693-2025"
                    'partnerNumber' => $strField(),   // e.g. "1693"
                    'pages' => $numField(),
                    'amendedK1' => $boolField(),
                    'finalK1' => $boolField(),
                    'taxYearBeginning' => $strField(),   // YYYY-MM-DD
                    'taxYearEnding' => $strField(),   // YYYY-MM-DD

                    // ── Left-panel fields (A–O): entity & partner identification ─────
                    'field_A' => $strField(),   // Partnership EIN
                    'field_B' => $strField(),   // Partnership name/address (multiline)
                    'field_C' => $strField(),   // IRS Center (Ogden / Kansas City / Cincinnati)
                    'field_D' => $boolField(),  // PTP indicator (checkbox)
                    'field_E' => $strField(),   // Partner identifying number
                    'field_F' => $strField(),   // Partner name/address (multiline)
                    'field_G' => $strField(),   // Partner type (General / LLC / Limited)
                    'field_H1' => $strField(),   // Domestic or Foreign
                    'field_H2' => $boolField(),  // Foreign U.S. person checkbox
                    'field_I1' => $strField(),   // Profit share beginning/end
                    'field_I2' => $strField(),   // Loss share beginning/end
                    'field_I3' => $strField(),   // Capital share beginning/end
                    'field_M' => $strField(),   // Tax basis capital
                    'field_N' => $strField(),   // At-risk amount
                    'field_O' => $strField(),   // Qualified liability

                    // ── Item J: Profit/Loss/Capital percentages ───────────────────────
                    'field_J_profit_beginning' => $numField(),
                    'field_J_profit_ending' => $numField(),
                    'field_J_loss_beginning' => $numField(),
                    'field_J_loss_ending' => $numField(),
                    'field_J_capital_beginning' => $numField(),
                    'field_J_capital_ending' => $numField(),

                    // ── Item K: Partner's share of liabilities ───────────────────────
                    'field_K_recourse_beginning' => $numField(),
                    'field_K_recourse_ending' => $numField(),
                    'field_K_nonrecourse_beginning' => $numField(),
                    'field_K_nonrecourse_ending' => $numField(),
                    'field_K_qual_nonrecourse_beginning' => $numField(),
                    'field_K_qual_nonrecourse_ending' => $numField(),

                    // ── Item L: Capital account analysis ─────────────────────────────
                    'field_L_beginning_capital' => $numField(),
                    'field_L_contributed' => $numField(),
                    'field_L_current_year_net' => $numField(),
                    'field_L_other_increase' => $numField(),
                    'field_L_withdrawals' => $numField(),
                    'field_L_ending_capital' => $numField(),
                    'field_L_capital_method' => $strField(),  // "TAX_BASIS" | "GAAP" | "SECTION_704B" | "OTHER"

                    // ── Right-panel fields (1–10, 12, 21): numeric income/deduction boxes ─
                    'field_1' => $numField(),   // Ordinary business income (loss)
                    'field_2' => $numField(),   // Net rental real estate income (loss)
                    'field_3' => $numField(),   // Other net rental income (loss)
                    'field_4' => $numField(),   // Guaranteed payments (total)
                    'field_4a' => $numField(),   // GP – services
                    'field_4b' => $numField(),   // GP – capital
                    'field_4c' => $numField(),   // GP – total
                    'field_5' => $numField(),   // Interest income
                    'field_6a' => $numField(),   // Ordinary dividends
                    'field_6b' => $numField(),   // Qualified dividends
                    'field_6c' => $numField(),   // Dividend equivalents
                    'field_7' => $numField(),   // Royalties
                    'field_8' => $numField(),   // Net short-term capital gain (loss)
                    'field_9a' => $numField(),   // Net long-term capital gain (loss)
                    'field_9b' => $numField(),   // Collectibles (28%) gain (loss)
                    'field_9c' => $numField(),   // Unrecaptured Sec. 1250 gain
                    'field_10' => $numField(),   // Net section 1231 gain (loss)
                    'field_12' => $numField(),   // Section 179 deduction
                    'field_21' => $numField(),   // Foreign taxes paid or accrued

                    // ── Coded boxes (11, 13–20): arrays of {code, value, notes} ──────
                    'codes_11' => $codeItemsProp(),  // Other income (loss)
                    'codes_13' => $codeItemsProp(),  // Other deductions
                    'codes_14' => $codeItemsProp(),  // Self-employment earnings
                    'codes_15' => $codeItemsProp(),  // Credits
                    'codes_16' => $codeItemsProp(),  // Foreign transactions
                    'codes_17' => $codeItemsProp(),  // AMT items
                    'codes_18' => $codeItemsProp(),  // Tax-exempt & nondeductible
                    'codes_19' => $codeItemsProp(),  // Distributions
                    'codes_20' => $codeItemsProp(),  // Other information

                    // ── Schedule K-3 (backward-compat fallback) ───────────────────────
                    'k3_sections' => $k3SectionProp(),

                    // ── Schedule K-3 Part I checkboxes ────────────────────────────────
                    'k3_part1_checkboxes' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'box' => $strField(),
                                'checked' => $boolField(),
                                'note' => $strField(),
                            ],
                            'required' => ['box', 'checked'],
                        ],
                    ],

                    // ── Schedule K-3 Part II rows (one per line+country combination) ──
                    'k3_part2_rows' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'line' => $strField(),
                                'country' => $strField(),
                                'col_a_us_source' => $numField(),
                                'col_b_foreign_branch' => $numField(),
                                'col_c_passive' => $numField(),
                                'col_d_general' => $numField(),
                                'col_e_other_901j' => $numField(),
                                'col_f_sourced_by_partner' => $numField(),
                                'col_g_total' => $numField(),
                                'note' => $strField(),
                            ],
                            'required' => ['line', 'country'],
                        ],
                    ],

                    // ── Schedule K-3 Part III Section 2: asset apportionment rows ─────
                    'k3_part3_asset_rows' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'line' => $strField(),
                                'col_a_us_source' => $numField(),
                                'col_b_foreign_branch' => $numField(),
                                'col_c_passive' => $numField(),
                                'col_d_general' => $numField(),
                                'col_f_sourced_by_partner' => $numField(),
                                'col_g_total' => $numField(),
                            ],
                            'required' => ['line'],
                        ],
                    ],

                    // ── Schedule K-3 Part III Section 4: foreign taxes by country ─────
                    'k3_part3_foreign_taxes' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'country' => $strField(),
                                'tax_type' => $strField(),   // "WHTD" | "PAID" | "ACCRUED"
                                'basket' => $strField(),   // "passive" | "general" | "branch" | "951A"
                                'amount_usd' => $numField(),
                                'amount_foreign_currency' => $numField(),
                                'exchange_rate' => $numField(),
                                'date_paid' => $strField(),
                            ],
                            'required' => ['country', 'amount_usd'],
                        ],
                    ],

                    // ── Schedule K-3 Part I Box 4: FX translation table ───────────────
                    'k3_part1_fx_translation' => [
                        'type' => 'ARRAY',
                        'items' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'country' => $strField(),
                                'date_paid' => $strField(),
                                'exchange_rate' => $numField(),
                                'amount_foreign_currency' => $numField(),
                                'amount_usd' => $numField(),
                            ],
                            'required' => ['country', 'amount_usd'],
                        ],
                    ],

                    // ── Schedule K-3 parts applicability checkboxes ───────────────────
                    'k3_parts_applicable' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'part1' => $boolField(), 'part2' => $boolField(), 'part3' => $boolField(),
                            'part4' => $boolField(), 'part5' => $boolField(), 'part6' => $boolField(),
                            'part7' => $boolField(), 'part8' => $boolField(), 'part9' => $boolField(),
                            'part10' => $boolField(), 'part11' => $boolField(), 'part12' => $boolField(),
                            'part13' => $boolField(),
                        ],
                    ],

                    // ── K-3 general notes ─────────────────────────────────────────────
                    'k3_notes' => [
                        'type' => 'ARRAY',
                        'items' => ['type' => 'STRING'],
                    ],

                    // ── Supplemental text & metadata ─────────────────────────────────
                    'raw_text' => $strField(),
                    'warnings' => [
                        'type' => 'ARRAY',
                        'items' => ['type' => 'STRING'],
                    ],
                ],
            ],
        ];
    }
}
