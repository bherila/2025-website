<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-document override for Form 1116 estimated gross foreign-source income.
 *
 * The default Form 1116 builder estimates gross foreign-source income from
 * 1099-DIV Box 7 foreign tax at the assumed §901 withholding rate (15%) when
 * the broker has not reported a gross figure directly. This model lets users
 * substitute a known precise gross figure (e.g. the value the CPA used on the
 * filed return) so the estimate is no longer used.
 *
 * @property int $id
 * @property int $user_id
 * @property int $document_id References fin_documents.id (unified document table).
 * @property string|null $payer_tin
 * @property string|null $account_identifier
 * @property float $gross_foreign_source_income
 * @property string|null $override_reason
 */
class FinTaxDocumentForm1116Override extends Model
{
    protected $table = 'fin_tax_document_form1116_overrides';

    protected $fillable = [
        'user_id',
        'document_id',
        'payer_tin',
        'account_identifier',
        'gross_foreign_source_income',
        'override_reason',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'document_id' => 'integer',
            'gross_foreign_source_income' => 'float',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
