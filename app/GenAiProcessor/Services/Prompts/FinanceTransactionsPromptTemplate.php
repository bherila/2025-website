<?php

namespace App\GenAiProcessor\Services\Prompts;

/**
 * Prompt template for bank/brokerage statement finance transaction imports.
 */
class FinanceTransactionsPromptTemplate extends PromptTemplate
{
    public function build(array $context): string
    {
        $accountsContext = $context['accounts'] ?? [];
        $accountsSection = $this->buildAccountsContext($accountsContext);

        return <<<PROMPT
Analyze the provided bank or brokerage statement PDF and extract investor-level account data only. Use the `addFinanceAccount` tool once per account. If tool use is unavailable, return ONLY valid TOON as an object with an `accounts` array where each `ACCOUNT` matches the tool payload below.{$accountsSection}

ACCOUNT schema:
- `statementInfo`: object with optional `brokerName`, `accountNumber`, `accountName`, `periodStart`, `periodEnd`, `closingBalance`
- `statementDetails[]`: `{ "section": string, "line_item": string, "statement_period_value": number, "ytd_value": number, "is_percentage": boolean }`
- `transactions[]`: `{ "date": "YYYY-MM-DD", "description": string, "amount": number, "type"?: string, "symbol"?: string|null, "quantity"?: number|null, "price"?: number|null, "commission"?: number, "fee"?: number }`
- `lots[]`: `{ "symbol": string, "description"?: string, "quantity": number, "purchaseDate": "YYYY-MM-DD", "costBasis": number, "costPerUnit"?: number, "marketValue"?: number, "unrealizedGainLoss"?: number, "saleDate"?: "YYYY-MM-DD", "proceeds"?: number, "realizedGainLoss"?: number }`

Rules:
1. Extract only partner-level or investor-level data. Exclude fund-level sections such as "Fund Level Capital Account", "Fund Level Summary", "Statement of Operations", "Statement of Cash Flows", "Statement of Assets & Liabilities", and "Statement of Changes in Partners' Capital".
2. Always use the unified multi-account shape: an object with `accounts` as an array of ACCOUNT objects. If a section is missing, return an empty array for that section.
3. Statement detail section mappings: "Statement Summary (Dollars)" → "Statement Summary (\$)", "Statement Summary (Percent)" → "Statement Summary (%)", "Investor Capital Account Detail" → "Investor Capital Account", "Tax and Pre Tax Return Detail (Dollars)" → "Tax and Pre-Tax Return Detail (\$)", "Tax and Pre Tax Return Detail (Percent)" → "Tax and Pre-Tax Return Detail (%)".
4. Statement detail line-item mappings: "Pre - Tax Return" → "Pre-Tax Return", "Post - Tax Return" → "Post-Tax Return", "Net Contributions / Withdrawals" → "Net Contributions/Withdrawals", "Mgt Fee" → "Management Fee", "Incentive Fee" → "Incentive Allocation", "Total Pre-Tax Fees" → "Total Fees", "Realized Gain (Loss)" → "Realized Gain/Loss", "Unrealized Gain (Loss)" → "Unrealized Gain/Loss", "Change In Unrealized" → "Change in Unrealized".
5. Extract dated transactions such as deposits, withdrawals, trades, dividends, and interest. Populate `symbol` for stock-related transactions; infer the well-known ticker when the company name is clear and no ticker is shown.
6. Extract lot-level data for both open and closed positions. Open lots include `marketValue` and `unrealizedGainLoss`; closed lots include `saleDate`, `proceeds`, and `realizedGainLoss`. Normalize Purchase Date, Acquisition Date, and Invt. Date to `purchaseDate`.
7. Return only valid TOON / tool arguments. Normalize all dates to `YYYY-MM-DD`, convert parentheses to negative numbers, strip footnote superscripts, normalize spacing, and output numeric fields as numbers.
PROMPT;
    }
}
