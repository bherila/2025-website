<?php

namespace App\GenAiProcessor\Services\Prompts;

/**
 * Prompt template for multi-account consolidated tax document imports
 * (e.g. Fidelity Tax Reporting Statement, Wealthfront 1099).
 */
class MultiAccountTaxImportPromptTemplate extends PromptTemplate
{
    public function build(array $context): string
    {
        $taxYear = (int) ($context['tax_year'] ?? date('Y'));
        $accounts = $context['accounts'] ?? [];

        $accountHints = $this->buildAccountsContext(
            array_map(fn ($a) => [
                'name' => $a['name'] ?? 'unknown',
                'last4' => $a['last4'] ?? 'unknown',
            ], $accounts)
        );

        return <<<PROMPT
You are processing a consolidated brokerage tax statement (e.g. Fidelity Tax Reporting Statement, Wealthfront 1099) for tax year {$taxYear}.

This PDF may contain forms for multiple accounts (1099-DIV, 1099-INT, 1099-MISC, 1099-B, etc.) across one or more brokerage accounts.{$accountHints}

Return a TOON **array** where each element represents one account/form combination. Each element must have these fields:
- `account_identifier`: The full or partial account number found in the PDF (string, e.g. "...1234" or "8W163GBF")
- `account_name`: The brokerage/account name found in the PDF (string, e.g. "Fidelity Brokerage")
- `form_type`: The specific IRS form type found in this section. Use one of: 1099_int, 1099_div, 1099_misc, 1099_b, k1 (string). Do NOT use "broker_1099" — that is the container type for the uploaded PDF, not a form type you should return.
- `tax_year`: The tax year this form covers (integer)
- `parsed_data`: An object containing the extracted form fields relevant to that form type (see below)

If the PDF is a consolidated 1099 that covers multiple form types for the same account, create one element per form type per account.

## parsed_data by form_type

**1099-DIV** (`form_type: "1099_div"`): Extract box values: `payer_name`, `payer_tin`, `box1a_ordinary`, `box1b_qualified`, `box2a_cap_gain`, `box2b_unrecap_1250`, `box2c_section_1202`, `box2d_collectibles`, `box2e_section_897_ordinary`, `box2f_section_897_cap_gain`, `box3_nondividend`, `box4_fed_tax`, `box5_section_199a`, `box6_investment_expense`, `box7_foreign_tax`, `box8_foreign_country`, `box9_cash_liquidation`, `box10_noncash_liquidation`, `box11_exempt_interest`, `box12_private_activity`, `box14_state_tax`. All amounts are numbers or null.

**1099-INT** (`form_type: "1099_int"`): Extract box values: `payer_name`, `payer_tin`, `box1_interest`, `box2_early_withdrawal`, `box3_savings_bond`, `box4_fed_tax`, `box5_investment_expense`, `box6_foreign_tax`, `box7_foreign_country`, `box8_tax_exempt`, `box9_private_activity`, `box10_market_discount`, `box11_bond_premium`, `box12_treasury_premium`, `box13_tax_exempt_premium`. All amounts are numbers or null.

**1099-MISC** (`form_type: "1099_misc"`): Extract box values: `payer_name`, `payer_tin`, `box1_rents`, `box2_royalties`, `box3_other_income`, `box4_fed_tax`, `box8_substitute_payments`. All amounts are numbers or null. Omit if all fields are zero.

**1099-B** (`form_type: "1099_b"`): Extract the summary totals AND all individual transaction lots.
- Summary fields: `payer_name`, `payer_tin`, `total_proceeds`, `total_cost_basis`, `total_wash_sale_disallowed`, `total_realized_gain_loss`
- `transactions`: TOON array of every individual lot line from the 1099-B sections (short-term covered, long-term covered, etc.). Each transaction object:
  - `symbol`: ticker symbol if shown, otherwise null (string or null)
  - `description`: security name / description (string)
  - `cusip`: CUSIP number if shown (string or null)
  - `quantity`: number of shares/units sold (number)
  - `purchase_date`: acquisition date as "YYYY-MM-DD", or "various" if multiple lots aggregated (string)
  - `sale_date`: date sold/disposed as "YYYY-MM-DD" (string)
  - `proceeds`: gross proceeds (number)
  - `cost_basis`: cost or other basis (number)
  - `accrued_market_discount`: accrued market discount if shown (number or null)
  - `wash_sale_disallowed`: wash sale loss disallowed amount (number, 0 if blank)
  - `realized_gain_loss`: net gain or loss (number)
  - `is_short_term`: true for short-term, false for long-term, null for undetermined (boolean or null)
  - `form_8949_box`: IRS Form 8949 reporting box — "A" (short covered), "B" (short not covered), "C" (short other), "D" (long covered), "E" (long not covered), "F" (long other) (string)
  - `is_covered`: whether basis is reported to IRS (boolean)
  - `additional_info`: any additional information column text (string or null)

Extract EVERY individual lot line. Do not skip lines or summarize. If a security shows subtotals, emit a separate transaction row for each individual lot line (not the subtotal row).

Return ONLY TOON, no Markdown fences and no other text.

Use TOON tabular arrays for repeated rows whenever possible, especially `transactions`, to avoid repeating field names. Example shape:

[1]:
  - account_identifier: X65-385336
    account_name: Fidelity Brokerage Services LLC
    form_type: 1099_b
    tax_year: {$taxYear}
    parsed_data:
      payer_name: National Financial Services LLC
      payer_tin: 04-3523567
      total_proceeds: 1234.56
      total_cost_basis: 1000
      total_wash_sale_disallowed: 0
      total_realized_gain_loss: 234.56
      transactions[2]{symbol,description,cusip,quantity,purchase_date,sale_date,proceeds,cost_basis,accrued_market_discount,wash_sale_disallowed,realized_gain_loss,is_short_term,form_8949_box,is_covered,additional_info}:
        NET,CLOUDFLARE INC CL A COM,18915M107,10,2025-03-27,2025-05-06,1229.74,1191.4,null,0,38.34,true,A,true,null
        FDMO,FIDELITY MOMENTUM FACTOR ETF,316092816,0.028,2024-06-24,2025-05-06,1.88,1.78,null,0,0.1,true,A,true,null
PROMPT;
    }
}
