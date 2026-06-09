<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinRsuVestSettlementAllocation extends Model
{
    protected $table = 'fin_rsu_vest_settlement_allocations';

    protected $fillable = [
        'settlement_id',
        'equity_award_id',
        'vested_shares',
        'gross_income',
        'allocation_ratio',
        'allocated_withheld_shares',
        'allocated_withheld_value',
        'allocated_tax_remitted',
        'allocated_excess_refund',
    ];

    protected function casts(): array
    {
        return [
            'vested_shares' => 'decimal:6',
            'gross_income' => 'decimal:4',
            'allocation_ratio' => 'decimal:10',
            'allocated_withheld_shares' => 'decimal:6',
            'allocated_withheld_value' => 'decimal:4',
            'allocated_tax_remitted' => 'decimal:4',
            'allocated_excess_refund' => 'decimal:4',
        ];
    }

    /** @return BelongsTo<FinRsuVestSettlement, $this> */
    public function settlement(): BelongsTo
    {
        return $this->belongsTo(FinRsuVestSettlement::class, 'settlement_id');
    }

    /** @return BelongsTo<FinEquityAwards, $this> */
    public function award(): BelongsTo
    {
        return $this->belongsTo(FinEquityAwards::class, 'equity_award_id');
    }
}
