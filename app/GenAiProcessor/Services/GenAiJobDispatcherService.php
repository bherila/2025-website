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

        return <<<PROMPT
Analyze the provided bank or brokerage statement PDF and extract investor-level account data only.

Return ONLY valid JSON in this structure:

```json
{
  "accounts": [
    {
      "statementInfo": {
        "brokerName": "",
        "accountNumber": "",
        "accountName": "",
        "periodStart": "YYYY-MM-DD",
        "periodEnd": "YYYY-MM-DD",
        "closingBalance": 0
      },
      "statementDetails": [
        {
          "section": "",
          "line_item": "",
          "statement_period_value": 0,
          "ytd_value": 0,
          "is_percentage": false
        }
      ],
      "transactions": [
        {
          "date": "YYYY-MM-DD",
          "description": "",
          "amount": 0,
          "type": "",
          "symbol": null,
          "quantity": null,
          "price": null,
          "commission": 0,
          "fee": 0
        }
      ],
      "lots": [
        {
          "symbol": "",
          "description": "",
          "quantity": 0,
          "purchaseDate": "YYYY-MM-DD",
          "costBasis": 0,
          "costPerUnit": 0,
          "marketValue": 0,
          "unrealizedGainLoss": 0,
          "saleDate": "YYYY-MM-DD",
          "proceeds": 0,
          "realizedGainLoss": 0
        }
      ]
    }
  ]
}
```
{$accountsSection}

Rules:
1. Always return an `accounts` array, even if the statement contains only one account.
2. Extract only partner-level or investor-level data. Exclude fund-level sections such as "Fund Level Capital Account", "Statement of Operations", "Statement of Cash Flows", "Statement of Assets & Liabilities", "Statement of Changes in Partners' Capital", and similar whole-fund summaries.
3. If a section is missing, return an empty array for that section.
4. All dates must be in YYYY-MM-DD format.

Statement details:
5. Extract investor-level summary sections with period-based columns (MTD/YTD, Statement Period/YTD, or similar).
6. Normalize section names to these canonical names when applicable:
   - "Statement Summary (\$)"
   - "Statement Summary (%)"
   - "Investor Capital Account"
   - "Tax and Pre-Tax Return Detail (\$)"
   - "Tax and Pre-Tax Return Detail (%)"
7. Normalize line item names to these canonical names when applicable:
   - "Pre-Tax Return", "Post-Tax Return", "Net Return"
   - "Total Beginning Capital", "Total Ending Capital"
   - "Contributions", "Withdrawals", "Net Contributions/Withdrawals"
   - "Management Fee", "Incentive Allocation", "Total Fees"
   - "Realized Gain/Loss", "Unrealized Gain/Loss", "Change in Unrealized"

Transactions:
8. Extract dated transactions such as deposits, withdrawals, trades, dividends, and interest.
9. Populate `symbol` for stock-related transactions. If a public company is named without a ticker, infer the well-known ticker. Use null for non-applicable fields.

Lots:
10. For open lots, include `marketValue` and `unrealizedGainLoss`, and omit sale fields.
11. For closed lots, include `saleDate`, `proceeds`, and `realizedGainLoss`, and omit unrealized fields.
12. Normalize purchase date labels such as Purchase Date, Acquisition Date, and Invt. Date to `purchaseDate`.

Normalization:
13. Convert parentheses to negative numbers.
14. Remove footnote superscripts.
15. Normalize spacing such as "Pre - Tax" to "Pre-Tax".
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
