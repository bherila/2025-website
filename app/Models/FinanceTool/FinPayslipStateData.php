<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinPayslipStateData extends Model
{
    protected $table = 'fin_payslip_state_data';

    protected $fillable = [
        'payslip_id',
        'state_code',
        'taxable_wages',
        'state_tax',
        'state_tax_addl',
        'state_disability',
    ];

    protected function casts(): array
    {
        return [
            'taxable_wages' => 'decimal:4',
            'state_tax' => 'decimal:4',
            'state_tax_addl' => 'decimal:4',
            'state_disability' => 'decimal:4',
        ];
    }

    public function payslip(): BelongsTo
    {
        return $this->belongsTo(FinPayslips::class, 'payslip_id', 'payslip_id');
    }
}
