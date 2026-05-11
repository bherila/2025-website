<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;

/**
 * Compatibility model for tax-form account partitions now stored in
 * fin_document_accounts. New code should prefer FinDocumentAccount directly.
 *
 * @property string|null $misc_routing
 * @property string|null $reporting_mode
 */
class TaxDocumentAccount extends FinDocumentAccount
{
    /**
     * Create a tax-form account link on the unified document-account table.
     */
    public static function createLink(
        int $documentId,
        ?int $accountId,
        ?string $formType = null,
        ?int $taxYear = null,
        ?int $statementId = null,
        ?string $accountSectionLabel = null,
        ?string $payloadKind = null,
        bool $isReviewed = false,
        ?string $notes = null,
        ?string $aiIdentifier = null,
        ?string $aiAccountName = null,
    ): static {
        $taxDocument = FileForTaxDocument::query()->findOrFail($documentId);

        /** @var static $link */
        $link = static::create([
            'document_id' => $taxDocument->document_id,
            'account_id' => $accountId,
            'form_type' => $formType,
            'tax_year' => $taxYear,
            'payload_kind' => $payloadKind ?? ($formType === FileForTaxDocument::FORM_TYPE_1099_B
                ? self::PAYLOAD_DISPOSITIONS
                : null),
            'is_reviewed' => $isReviewed,
            'notes' => $notes,
            'ai_identifier' => $aiIdentifier,
            'ai_account_name' => $aiAccountName,
        ]);

        return $link;
    }
}
