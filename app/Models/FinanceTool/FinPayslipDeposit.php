<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinPayslipDeposit extends Model
{
    protected $table = 'fin_payslip_deposits';

    protected $fillable = [
        'payslip_id',
        'bank_name',
        'account_last4',
        'amount',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
        ];
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(FinPayslips::class, 'payslip_id', 'payslip_id');
    }
}
