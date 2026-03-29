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

            $normalized[] = [
                'section' => is_string($detail['section'] ?? null) ? trim($detail['section']) : '',
                'line_item' => is_string($detail['line_item'] ?? null) ? trim($detail['line_item']) : '',
                'statement_period_value' => $this->normalizeNumber($detail['statement_period_value'] ?? null) ?? 0.0,
                'ytd_value' => $this->normalizeNumber($detail['ytd_value'] ?? null) ?? 0.0,
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
            $amount = $this->normalizeNumber($transaction['amount'] ?? null);

            if ($date === null || $amount === null) {
                // Drop transactions missing a valid date or amount instead of using placeholders.
                continue;
            }

            $item = [
                'date' => $date,
                'description' => is_string($transaction['description'] ?? null) ? trim($transaction['description']) : '',
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

            if ($purchaseDate === null || $costBasis === null) {
                continue;
            }

            $quantity = $this->normalizeNumber($lot['quantity'] ?? null);
            if ($quantity === null) {
                $quantity = 0.0;
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
}
