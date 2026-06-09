<?php

namespace App\Models\FinanceTool;

use App\Models\Files\FileForTaxDocument;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinPartnershipInterest extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_partnership_interests';

    protected $fillable = [
        'user_id',
        'account_id',
        'partnership_ein',
        'partnership_name',
        'normalized_partnership_name',
        'form_type',
        'is_ptp',
        'is_trader_fund',
        'interest_start_date',
        'interest_end_date',
        'source_tax_document_id',
        'source_tax_document_account_id',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'is_ptp' => 'boolean',
            'is_trader_fund' => 'boolean',
            'interest_start_date' => 'date',
            'interest_end_date' => 'date',
            'metadata' => 'array',
        ];
    }

    /** @return BelongsTo<FinAccounts, $this> */
    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'account_id', 'acct_id');
    }

    /** @return BelongsTo<FileForTaxDocument, $this> */
    public function sourceTaxDocument(): BelongsTo
    {
        return $this->belongsTo(FileForTaxDocument::class, 'source_tax_document_id');
    }

    /** @return BelongsTo<TaxDocumentAccount, $this> */
    public function sourceTaxDocumentAccount(): BelongsTo
    {
        return $this->belongsTo(TaxDocumentAccount::class, 'source_tax_document_account_id');
    }

    /** @return HasMany<FinPartnershipBasisYear, $this> */
    public function basisYears(): HasMany
    {
        return $this->hasMany(FinPartnershipBasisYear::class, 'partnership_interest_id');
    }

    /** @return HasMany<FinPartnershipBasisEvent, $this> */
    public function basisEvents(): HasMany
    {
        return $this->hasMany(FinPartnershipBasisEvent::class, 'partnership_interest_id');
    }
}
