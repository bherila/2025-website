<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinStatementInvestment extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_statement_investments';

    protected $fillable = [
        'user_id',
        'account_id',
        'statement_id',
        'document_id',
        'as_of_date',
        'investment_name',
        'investment_category',
        'quantity',
        'ownership_percentage',
        'cost_basis',
        'fair_value',
        'unrealized_gain_loss',
        'currency',
        'source_line',
        'raw_payload',
    ];

    protected function casts(): array
    {
        return [
            'as_of_date' => 'date',
            'quantity' => 'decimal:8',
            'ownership_percentage' => 'decimal:8',
            'cost_basis' => 'decimal:4',
            'fair_value' => 'decimal:4',
            'unrealized_gain_loss' => 'decimal:4',
            'raw_payload' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
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

    /** @return BelongsTo<FinDocument, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(FinDocument::class, 'document_id');
    }
}
