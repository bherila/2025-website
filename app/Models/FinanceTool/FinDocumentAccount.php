<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinDocumentAccount extends Model
{
    public const string PAYLOAD_DISPOSITIONS = 'dispositions';

    public const string PAYLOAD_POSITIONS = 'positions';

    public const string PAYLOAD_CSV_IMPORT = 'csv_import';

    protected $table = 'fin_document_accounts';

    protected $fillable = [
        'document_id',
        'account_id',
        'statement_id',
        'form_type',
        'tax_year',
        'account_section_label',
        'payload_kind',
        'ai_identifier',
        'ai_account_name',
        'is_reviewed',
        'notes',
        'misc_routing',
        'reporting_mode',
        'parsed_data_needs_review',
        'parsed_data_warnings',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'is_reviewed' => 'boolean',
            'parsed_data_needs_review' => 'boolean',
            'parsed_data_warnings' => 'array',
        ];
    }

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
        /** @var static $link */
        $link = static::create([
            'document_id' => $documentId,
            'account_id' => $accountId,
            'statement_id' => $statementId,
            'form_type' => $formType,
            'tax_year' => $taxYear,
            'account_section_label' => $accountSectionLabel,
            'payload_kind' => $payloadKind,
            'is_reviewed' => $isReviewed,
            'notes' => $notes,
            'ai_identifier' => $aiIdentifier,
            'ai_account_name' => $aiAccountName,
        ]);

        return $link;
    }

    /** @return BelongsTo<FinDocument, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(FinDocument::class, 'document_id');
    }

    /** @return BelongsTo<FinAccounts, $this> */
    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'account_id', 'acct_id');
    }

    /** @return BelongsTo<FinStatement, $this> */
    public function statement(): BelongsTo
    {
        return $this->belongsTo(FinStatement::class, 'statement_id', 'statement_id');
    }

    /** @return BelongsTo<FileForTaxDocument, $this> */
    public function taxDocument(): BelongsTo
    {
        return $this->belongsTo(FileForTaxDocument::class, 'document_id', 'document_id');
    }

    /**
     * @return Attribute<int|null, never>
     */
    protected function taxDocumentId(): Attribute
    {
        return Attribute::make(get: function (): ?int {
            $taxDocument = $this->relationLoaded('taxDocument') ? $this->getRelation('taxDocument') : $this->taxDocument;

            return $taxDocument instanceof FileForTaxDocument ? (int) $taxDocument->id : null;
        });
    }
}
