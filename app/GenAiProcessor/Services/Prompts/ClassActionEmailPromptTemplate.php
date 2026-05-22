<?php

namespace App\GenAiProcessor\Services\Prompts;

class ClassActionEmailPromptTemplate extends PromptTemplate
{
    public function build(array $context): string
    {
        $emailText = (string) ($context['pasted_text'] ?? '');
        $referencePageText = (string) ($context['reference_page_text'] ?? '');

        $referenceBlock = $referencePageText !== ''
            ? "\n\nReference page text (optional context from settlement website):\n{$referencePageText}"
            : '';

        return <<<PROMPT
Extract class-action claim details from the pasted email text below.

Return ONLY valid JSON (no markdown) matching this schema exactly:
{
  "name": "string | null",
  "claim_id": "string | null",
  "pin": "string | null",
  "administrator": "string | null",
  "defendant": "string | null",
  "class_action_url": "string | null",
  "notification_received_on": "YYYY-MM-DD | null",
  "claim_submitted_on": "YYYY-MM-DD | null",
  "claim_deadline": "YYYY-MM-DD | null",
  "final_approval_hearing_on": "YYYY-MM-DD | null",
  "payment_election_submitted_on": "YYYY-MM-DD | null",
  "expected_payment_on": "YYYY-MM-DD | null",
  "expected_payment_amount": "number | null",
  "confidence": { "<field>": 0.0-1.0 },
  "notes": "string | null"
}

Rules:
- claim_id may be labeled "Unique ID", "Claim Number", or "Confirmation Code".
- claim_deadline must be the filing deadline ("must be submitted by", "postmarked by"), not opt-out or objection deadlines.
- Use null for missing values.
- Normalize dates to YYYY-MM-DD.
- Do not include extra keys.

Email text:
{$emailText}{$referenceBlock}
PROMPT;
    }
}
