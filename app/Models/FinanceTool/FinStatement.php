<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinStatement extends Model
{
    protected $table = 'fin_statements';

    protected $primaryKey = 'statement_id';

    public $timestamps = false;

    protected $fillable = [
        'acct_id',
        'balance',
        'statement_opening_date',
        'statement_closing_date',
        'cost_basis',
        'is_cost_basis_override',
    ];

    protected function casts(): array
    {
        return [
            'statement_opening_date' => 'date',
            'statement_closing_date' => 'date',
            'cost_basis' => 'decimal:4',
            'is_cost_basis_override' => 'boolean',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }

    public function details(): HasMany
    {
        return $this->hasMany(FinStatementDetail::class, 'statement_id', 'statement_id');
    }

    public function lots(): HasMany
    {
        return $this->hasMany(FinAccountLot::class, 'statement_id', 'statement_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(FinAccountLineItems::class, 'statement_id', 'statement_id');
    }
}
