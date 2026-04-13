<?php

namespace App\GenAiProcessor\Services\Prompts;

use App\GenAiProcessor\Services\GenAiJobDispatcherService;

/**
 * Prompt template for single-account tax document imports (W-2, 1099-INT, etc.).
 *
 * Dispatches to the appropriate form-type sub-template based on `form_type` in context.
 */
class TaxDocumentPromptTemplate extends PromptTemplate
{
    public function build(array $context): string
    {
        $formType = $context['form_type'] ?? 'w2';
        $taxYear = (int) ($context['tax_year'] ?? date('Y'));

        return match (true) {
            in_array($formType, ['w2', 'w2c']) => $this->buildW2Prompt($formType, $taxYear),
            in_array($formType, ['1099_int', '1099_int_c']) => $this->build1099IntPrompt($formType, $taxYear),
            in_array($formType, ['1099_div', '1099_div_c']) => $this->build1099DivPrompt($formType, $taxYear),
            $formType === '1099_misc' => $this->build1099MiscPrompt($taxYear),
            $formType === 'k1' => $this->buildK1Prompt($taxYear),
            default => throw new \InvalidArgumentException("Unknown tax form type: {$formType}"),
        };
    }

    private function buildW2Prompt(string $formType, int $taxYear): string
    {
        $formName = $formType === 'w2c' ? 'W-2c (Corrected Wage and Tax Statement)' : 'W-2 (Wage and Tax Statement)';
        $toolName = GenAiJobDispatcherService::TAX_DOCUMENT_W2_TOOL_NAME;

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
        $toolName = GenAiJobDispatcherService::TAX_DOCUMENT_1099INT_TOOL_NAME;

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
        $toolName = GenAiJobDispatcherService::TAX_DOCUMENT_1099DIV_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Analyze the provided {$formName} PDF for tax year {$taxYear}.
Use the `{$toolName}` tool to return ALL extracted box values from the Dividends and Distributions form.
All monetary values must be numbers (not strings). If a field is not present on the form, set it to null.
PROMPT;
    }

    private function build1099MiscPrompt(int $taxYear): string
    {
        $toolName = GenAiJobDispatcherService::TAX_DOCUMENT_1099MISC_TOOL_NAME;

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
        $toolName = GenAiJobDispatcherService::TAX_DOCUMENT_K1_TOOL_NAME;

        return <<<PROMPT
<!-- tool:{$toolName} -->
Extract ALL data from this Schedule K-1 PDF (tax year {$taxYear}) using the `{$toolName}` tool.
This document may include the K-1 face page, supporting statements, and a multi-page Schedule K-3.

EXTRACTION RULES:

1. FLAT FIELDS (fields A–O, boxes 1–10, 12, 14, 21):
   Extract every labeled field. Use null for absent fields. For these flat numeric fields,
   return numbers as JSON numbers (not strings).
   Negative amounts shown in parentheses like (1,234) must be returned as -1234.
   Box 21 (foreign taxes paid or accrued) is a direct numeric field, not a coded box.

2. CODED BOXES (11, 13–20):
   Each code entry becomes a SEPARATE array item even if the same code appears multiple times.
   The coded-box `value` field must follow the tool schema and be returned as a string,
   preserving the value shown on the form/supporting statement (for example, "-23167").
   CRITICAL: When a box has multiple sub-items under the same code (e.g., Box 11 Code ZZ
   contains three distinct items: §988 loss, swap loss, PFIC income), create one array entry
   per sub-item with its individual amount/value and a descriptive note.
   Example: three Box 11 ZZ entries with values "-23167", "-54237", and "3198" respectively.
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
   - Flat monetary fields: JSON numbers. Coded-box `value` fields: strings matching the tool schema. Parentheses = negative.
   - All percentages: store as decimal (e.g., 0.042400 not 4.2400).
   - All dates: YYYY-MM-DD.
   - Partner number / form ID: capture from header if present.
PROMPT;
    }
}
