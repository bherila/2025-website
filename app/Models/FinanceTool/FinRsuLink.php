<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinRsuLink extends Model
{
    public const array LINK_TYPES = [
        'share_deposit',
        'sell_to_cover',
        'withholding_cash',
        'excess_refund',
        'sale',
        'tax_lot',
        'payslip_rsu_income',
        'payslip_rsu_tax_offset',
        'payslip_rsu_excess_refund',
        'other',
    ];

    protected $table = 'fin_rsu_links';

    protected $fillable = [
        'uid',
        'settlement_id',
        'settlement_allocation_id',
        'equity_award_id',
        'link_type',
        'transaction_id',
        'account_id',
        'lot_id',
        'payslip_id',
        'confidence',
        'confidence_reasons',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'confidence' => 'decimal:4',
            'confidence_reasons' => 'array',
        ];
    }

    /** @return BelongsTo<FinRsuVestSettlement, $this> */
    public function settlement(): BelongsTo
    {
        return $this->belongsTo(FinRsuVestSettlement::class, 'settlement_id');
    }

    /** @return BelongsTo<FinAccountLineItems, $this> */
    public function transaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 'transaction_id', 't_id');
    }

    /** @return BelongsTo<FinPayslips, $this> */
    public function payslip(): BelongsTo
    {
        return $this->belongsTo(FinPayslips::class, 'payslip_id', 'payslip_id');
    }
}
