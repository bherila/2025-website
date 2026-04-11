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
 */
class TaxDocumentAccount extends Model
{
    protected $table = 'fin_tax_document_accounts';

    protected $fillable = [
        'tax_document_id',
        'account_id',
        'form_type',
        'tax_year',
        'is_reviewed',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'is_reviewed' => 'boolean',
        ];
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
