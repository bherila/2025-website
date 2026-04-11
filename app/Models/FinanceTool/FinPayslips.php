<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Canonical fillable/casts list — keep in sync with payslipDbCols.ts (Zod schema).
 * State tax data lives in the fin_payslip_state_data child table; flat columns
 * ps_state_tax, ps_state_tax_addl, ps_state_disability have been dropped.
 */
class FinPayslips extends Model
{
    protected $table = 'fin_payslip';

    protected $primaryKey = 'payslip_id';

    protected $fillable = [
        'uid',
        'period_start',
        'period_end',
        'pay_date',
        'employment_entity_id',
        // Earnings
        'earnings_gross',
        'earnings_bonus',
        'earnings_net_pay',
        'earnings_rsu',
        'earnings_dividend_equivalent',
        // Imputed income
        'imp_other',
        'imp_legal',
        'imp_fitness',
        'imp_ltd',
        'imp_life_choice',
        // Federal taxes
        'ps_oasdi',
        'ps_medicare',
        'ps_fed_tax',
        'ps_fed_tax_addl',
        'ps_fed_tax_refunded',
        // Taxable wage bases
        'taxable_wages_oasdi',
        'taxable_wages_medicare',
        'taxable_wages_federal',
        // RSU post-tax offsets (stored as positive)
        'ps_rsu_tax_offset',
        'ps_rsu_excess_refund',
        // Retirement
        'ps_401k_pretax',
        'ps_401k_aftertax',
        'ps_401k_employer',
        // Pre-tax deductions
        'ps_pretax_medical',
        'ps_pretax_fsa',
        'ps_salary',
        'ps_vacation_payout',
        'ps_pretax_dental',
        'ps_pretax_vision',
        // PTO / hours
        'pto_accrued',
        'pto_used',
        'pto_available',
        'pto_statutory_available',
        'hours_worked',
        // Meta
        'ps_payslip_file_hash',
        'ps_is_estimated',
        'ps_comment',
        // Catch-all JSON
        'other',
    ];

    protected function casts(): array
    {
        return [
            'earnings_gross' => 'decimal:4',
            'earnings_bonus' => 'decimal:4',
            'earnings_net_pay' => 'decimal:4',
            'earnings_rsu' => 'decimal:4',
            'earnings_dividend_equivalent' => 'decimal:4',
            'imp_other' => 'decimal:4',
            'imp_legal' => 'decimal:4',
            'imp_fitness' => 'decimal:4',
            'imp_ltd' => 'decimal:4',
            'imp_life_choice' => 'decimal:4',
            'ps_oasdi' => 'decimal:4',
            'ps_medicare' => 'decimal:4',
            'ps_fed_tax' => 'decimal:4',
            'ps_fed_tax_addl' => 'decimal:4',
            'ps_fed_tax_refunded' => 'decimal:4',
            'taxable_wages_oasdi' => 'decimal:4',
            'taxable_wages_medicare' => 'decimal:4',
            'taxable_wages_federal' => 'decimal:4',
            'ps_rsu_tax_offset' => 'decimal:4',
            'ps_rsu_excess_refund' => 'decimal:4',
            'ps_401k_pretax' => 'decimal:4',
            'ps_401k_aftertax' => 'decimal:4',
            'ps_401k_employer' => 'decimal:4',
            'ps_pretax_medical' => 'decimal:4',
            'ps_pretax_fsa' => 'decimal:4',
            'ps_salary' => 'decimal:4',
            'ps_vacation_payout' => 'decimal:4',
            'ps_pretax_dental' => 'decimal:4',
            'ps_pretax_vision' => 'decimal:4',
            'pto_accrued' => 'decimal:2',
            'pto_used' => 'decimal:2',
            'pto_available' => 'decimal:2',
            'pto_statutory_available' => 'decimal:2',
            'hours_worked' => 'decimal:2',
            'ps_is_estimated' => 'boolean',
            'other' => 'array',
        ];
    }

    public function employmentEntity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }

    public function stateData(): HasMany
    {
        return $this->hasMany(FinPayslipStateData::class, 'payslip_id', 'payslip_id');
    }

    public function deposits(): HasMany
    {
        return $this->hasMany(FinPayslipDeposit::class, 'payslip_id', 'payslip_id');
    }

    protected static function booted(): void
    {
        static::deleting(function (FinPayslips $payslip): void {
            // Hard-delete child records via model events so that any observers fire.
            $payslip->deposits()->delete();
            $payslip->stateData()->delete();
        });
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (! auth()->check()) {
                throw new \Exception('Authentication required to create payslip');
            }
            if ($model->uid && $model->uid != auth()->id()) {
                throw new \Exception('Cannot set uid to a different user');
            }
            $model->uid = auth()->id();
        });

        static::addGlobalScope('user', function (Builder $builder) {
            if (auth()->check()) {
                $builder->where('uid', auth()->id());
            } else {
                $builder->whereRaw('1 = 0');
            }
        });
    }
}
