<?php

namespace App\GenAiProcessor\Services\Prompts;

/**
 * Prompt template for RSU grant and vest-confirmation PDF imports.
 */
class EquityAwardPromptTemplate extends PromptTemplate
{
    public function build(array $context): string
    {
        $fileCount = $context['file_count'] ?? 1;
        $defaultSymbol = is_string($context['default_symbol'] ?? null)
            ? strtoupper(trim((string) $context['default_symbol']))
            : '';

        $symbolInstruction = $defaultSymbol !== ''
            ? "If the document does not name a ticker, use `{$defaultSymbol}` as the symbol."
            : 'If the document does not name a ticker, leave `symbol` null.';

        return <<<PROMPT
Analyze the provided {$fileCount} RSU grant letter or vest-confirmation PDF document(s).
I have provided each file preceded by "Filename: [name]".

Return a SINGLE TOON array containing one object per vest tranche. A single grant
letter commonly contains many vest dates, so emit one object for each vest event.

**TOON Fields per vest tranche:**
- `original_filename`: The filename provided.
- `award_id`: The grant or award identifier, max 20 characters.
- `grant_date`: Grant date (YYYY-MM-DD).
- `vest_date`: Vest date for this tranche (YYYY-MM-DD).
- `share_count`: Whole number of shares vesting in this tranche.
- `symbol`: Stock ticker, uppercase, max 4 characters. {$symbolInstruction}
- `grant_price`: Price per share at grant date, if present. Use FMV for RSUs, not option strike price.
- `vest_price`: Price per share at vest date, if present.

**Instructions:**
1. Return only TOON. Do not include Markdown fences or explanatory text.
2. Include grant-level fields on every tranche object.
3. Omit fields or set them to `null` when the document does not contain the value.
4. Do not infer missing prices from market history. Leave unknown prices null.
5. This job is only for RSUs. If the document is an ISO, NSO, or other option grant,
   still extract any RSU-like vest table if present, but do not treat strike price as `grant_price`.
6. If a symbol is longer than 4 characters, leave `symbol` null rather than truncating it.

PROMPT;
    }
}
