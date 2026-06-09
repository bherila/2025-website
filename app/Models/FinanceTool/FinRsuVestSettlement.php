<?php

namespace App\Models\FinanceTool;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinRsuVestSettlement extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_rsu_vest_settlements';

    protected $fillable = [
        'uid',
        'vest_date',
        'symbol',
        'vest_price',
        'vest_price_source',
        'gross_shares',
        'gross_income',
        'withheld_shares_whole',
        'withheld_value',
        'actual_tax_remitted',
        'excess_refund',
        'brokerage_account_id',
        'payslip_id',
        'refund_payslip_id',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'vest_date' => 'date',
            'vest_price' => 'decimal:6',
            'gross_shares' => 'decimal:6',
            'gross_income' => 'decimal:4',
            'withheld_shares_whole' => 'decimal:6',
            'withheld_value' => 'decimal:4',
            'actual_tax_remitted' => 'decimal:4',
            'excess_refund' => 'decimal:4',
        ];
    }

    /** @return HasMany<FinRsuVestSettlementAllocation, $this> */
    public function allocations(): HasMany
    {
        return $this->hasMany(FinRsuVestSettlementAllocation::class, 'settlement_id');
    }

    /** @return HasMany<FinRsuLink, $this> */
    public function links(): HasMany
    {
        return $this->hasMany(FinRsuLink::class, 'settlement_id');
    }

    /** @return BelongsTo<FinAccounts, $this> */
    public function brokerageAccount(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'brokerage_account_id', 'acct_id');
    }

    /** @return BelongsTo<FinPayslips, $this> */
    public function payslip(): BelongsTo
    {
        return $this->belongsTo(FinPayslips::class, 'payslip_id', 'payslip_id');
    }

    /** @return BelongsTo<FinPayslips, $this> */
    public function refundPayslip(): BelongsTo
    {
        return $this->belongsTo(FinPayslips::class, 'refund_payslip_id', 'payslip_id');
    }
}
