<?php

namespace App\GenAiProcessor\Services;

use App\GenAiProcessor\Models\GenAiDailyQuota;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class GenAiJobDispatcherService
{
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

        $multiAccountNote = ! empty($accountsContext)
            ? "\n16. **Multi-account statements**: If the document contains transactions for multiple accounts (e.g. a bank summary statement), group the data by account and return an `accounts` array instead of flat top-level fields. Each element of `accounts` must have the same structure as the single-account format (`statementInfo`, `statementDetails`, `transactions`, `lots`). Match each account's number to the known accounts above using the last 4 digits, and set `statementInfo.accountName` to the matched account name when possible."
            : '';

        return <<<PROMPT
Analyze the provided bank or brokerage statement PDF and extract:
1. Statement summary information
2. Statement detail line items (sections with MTD/YTD or period columns showing performance, capital, taxes, etc.)
3. Transaction entries (individual transactions with dates)
4. Lot-level position data (open and closed lots with purchase/sale details){$accountsSection}

Return the data as JSON with this structure for a **single-account** statement:

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
      "section": "Statement Summary (\$)",
      "line_item": "Pre-Tax Return",
      "statement_period_value": -23355.87,
      "ytd_value": 12312.59,
      "is_percentage": false
    }
  ],
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Transaction description",
      "amount": 100.00,
      "type": "deposit",
      "symbol": "AAPL",
      "quantity": 100,
      "price": 150.00,
      "commission": 0,
      "fee": 0
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

For a **multi-account** statement (e.g. a bank summary with multiple sub-accounts), return:

```json
{
  "accounts": [
    {
      "statementInfo": { "brokerName": "Bank", "accountNumber": "xxxx1234", "accountName": "Savings", "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", "closingBalance": 5000.00 },
      "statementDetails": [],
      "transactions": [{ "date": "YYYY-MM-DD", "description": "Deposit", "amount": 100.00, "type": "deposit", "symbol": null, "quantity": null, "price": null, "commission": 0, "fee": 0 }],
      "lots": []
    },
    {
      "statementInfo": { "brokerName": "Bank", "accountNumber": "xxxx5678", "accountName": "Checking", "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD", "closingBalance": 1200.00 },
      "statementDetails": [],
      "transactions": [],
      "lots": []
    }
  ]
}
```

**Instructions:**
1. Return ONLY valid JSON with no other text.
2. All dates should be in YYYY-MM-DD format.
3. **IMPORTANT: Only extract PARTNER-LEVEL or INVESTOR-LEVEL data.** Do NOT extract data from fund-level sections such as "Fund Level Capital Account", "Fund Level Summary", "Statement of Operations", "Statement of changes in partners' capital", "Statement of assets, liabilities, and partners' capital", "Statement of cash flows", or any section that describes the overall fund rather than the individual partner/investor.
4. **Statement Details**: Extract ALL line items from sections with period-based columns (MTD/YTD, Statement Period/YTD, or similar). This includes both hedge fund/partnership sections and retail brokerage/robo-advisor summary sections such as:
   - Statement Summary (\$ and %)
   - Investor Capital Account
   - Tax and Pre-Tax Return Detail
   - Account Value, Net Contributions, Time-Weighted Return, Positions
   - Any similar investor/account-level summary or performance sections
5. For statement details:
   - `section`: The section header (e.g., "Statement Summary (\$)", "Investor Capital Account")
   - `line_item`: The row label (e.g., "Pre-Tax Return", "Total Beginning Capital")
   - `statement_period_value`: The MTD/Statement Period value as a number
   - `ytd_value`: The YTD value as a number
   - `is_percentage`: true if the values are percentages, false if currency amounts
6. **CRITICAL for consistency**: Use these exact canonical section names when they match the content:
   - "Statement Summary (\$)" for dollar-value summary items
   - "Statement Summary (%)" for percentage summary items
   - "Investor Capital Account" for capital account items
   - "Tax and Pre-Tax Return Detail (\$)" for dollar tax detail
   - "Tax and Pre-Tax Return Detail (%)" for percentage tax detail
   If the document uses a similar but slightly different section name (e.g. "Statement Summary (Dollars)"), map it to the canonical name above. Only create new section names for genuinely different sections not covered above.
7. **CRITICAL for consistency**: Use these exact canonical line item names when they match the content:
   - "Pre-Tax Return", "Post-Tax Return", "Net Return"
   - "Total Beginning Capital", "Total Ending Capital"
   - "Contributions", "Withdrawals", "Net Contributions/Withdrawals"
   - "Management Fee", "Incentive Allocation", "Total Fees"
   - "Realized Gain/Loss", "Unrealized Gain/Loss", "Change in Unrealized"
   If the document uses a variant (e.g. "Pre - Tax Return", "Mgt Fee"), normalize to the canonical name.
8. **Transactions**: Extract individual dated transactions (deposits, withdrawals, trades, etc.) if present. For brokerage/investment transactions, include optional fields:
   - `symbol`: Ticker symbol (e.g., "AAPL") — omit or set null if not applicable
   - `quantity`: Number of shares/units — omit or set null if not applicable
   - `price`: Per-share/unit price — omit or set null if not applicable
   - `commission`: Commission paid — omit or set 0 if none
   - `fee`: Additional fee — omit or set 0 if none
9. **Lots**: Extract lot-level position data if present.
   - `purchaseDate`: The acquisition/investment date (may be labeled "Invt. Date", "Acquisition Date", "Purchase Date", or similar).
   - For **open lots** (positions still held with unrealized gain/loss), include `marketValue` and `unrealizedGainLoss`. Omit `saleDate`, `proceeds`, and `realizedGainLoss`.
   - For **closed lots** (sold positions with realized gain/loss), include `saleDate`, `proceeds`, and `realizedGainLoss`. Omit `marketValue` and `unrealizedGainLoss`.
10. Parse negative amounts correctly - numbers in parentheses like (23,355.87) should be -23355.87.
11. Strip footnote superscripts from line items (e.g., "Total Pre-Tax Fees³" → "Total Pre-Tax Fees").
12. Condense spacing (e.g., "Pre - Tax Return" → "Pre-Tax Return").
13. If PDF has no transactions, return an empty transactions array.
14. If PDF has no statement details, return an empty statementDetails array.
15. If PDF has no lot data, return an empty lots array.{$multiAccountNote}
PROMPT;
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
