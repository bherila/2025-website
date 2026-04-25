<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per (tax_document, account) pair.
 * A consolidated multi-account PDF produces multiple rows pointing at the same
 * parent fin_tax_documents record. Single-account PDFs produce one row each.
 *
 * is_reviewed and notes are per-account (review is done per account/form, not per PDF).
 *
 * @property int $id
 * @property int $tax_document_id
 * @property int|null $account_id
 * @property string $form_type
 * @property int $tax_year
 * @property string|null $ai_identifier
 * @property string|null $ai_account_name
 * @property bool $is_reviewed
 * @property string|null $notes
 * @property string|null $misc_routing
 */
class TaxDocumentAccount extends Model
{
    protected $table = 'fin_tax_document_accounts';

    protected $fillable = [
        'tax_document_id',
        'account_id',
        'form_type',
        'tax_year',
        'ai_identifier',
        'ai_account_name',
        'is_reviewed',
        'notes',
        'misc_routing',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'is_reviewed' => 'boolean',
        ];
    }

    /**
     * Create a canonical account link row.
     *
     * All code that creates fin_tax_document_accounts rows should use this factory
     * so that column defaults and required fields are managed in one place.
     */
    public static function createLink(
        int $taxDocumentId,
        ?int $accountId,
        string $formType,
        int $taxYear,
        bool $isReviewed = false,
        ?string $notes = null,
        ?string $aiIdentifier = null,
        ?string $aiAccountName = null,
    ): static {
        return static::create([
            'tax_document_id' => $taxDocumentId,
            'account_id' => $accountId,
            'form_type' => $formType,
            'tax_year' => $taxYear,
            'is_reviewed' => $isReviewed,
            'notes' => $notes,
            'ai_identifier' => $aiIdentifier,
            'ai_account_name' => $aiAccountName,
        ]);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(FileForTaxDocument::class, 'tax_document_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'account_id', 'acct_id');
    }
}
