<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FinPayslips extends Model
{
    use SoftDeletes;

    protected $table = 'fin_payslip';

    protected $primaryKey = 'payslip_id';

    protected $fillable = [
        'uid',
        'period_start',
        'period_end',
        'pay_date',
        'earnings_gross',
        'earnings_bonus',
        'earnings_net_pay',
        'earnings_rsu',
        'imp_other',
        'imp_legal',
        'imp_fitness',
        'imp_ltd',
        'ps_oasdi',
        'ps_medicare',
        'ps_fed_tax',
        'ps_fed_tax_addl',
        'ps_state_tax',
        'ps_state_tax_addl',
        'ps_state_disability',
        'ps_401k_pretax',
        'ps_401k_aftertax',
        'ps_401k_employer',
        'ps_fed_tax_refunded',
        'ps_payslip_file_hash',
        'ps_is_estimated',
        'ps_comment',
        'ps_pretax_medical',
        'ps_pretax_fsa',
        'ps_salary',
        'ps_vacation_payout',
        'ps_pretax_dental',
        'ps_pretax_vision',
        'other',
    ];

    protected function casts(): array
    {
        return [
            'earnings_gross' => 'decimal:4',
            'earnings_bonus' => 'decimal:4',
            'earnings_net_pay' => 'decimal:4',
            'earnings_rsu' => 'decimal:4',
            'imp_other' => 'decimal:4',
            'imp_legal' => 'decimal:4',
            'imp_fitness' => 'decimal:4',
            'imp_ltd' => 'decimal:4',
            'ps_oasdi' => 'decimal:4',
            'ps_medicare' => 'decimal:4',
            'ps_fed_tax' => 'decimal:4',
            'ps_fed_tax_addl' => 'decimal:4',
            'ps_state_tax' => 'decimal:4',
            'ps_state_tax_addl' => 'decimal:4',
            'ps_state_disability' => 'decimal:4',
            'ps_401k_pretax' => 'decimal:4',
            'ps_401k_aftertax' => 'decimal:4',
            'ps_401k_employer' => 'decimal:2',
            'ps_fed_tax_refunded' => 'decimal:4',
            'ps_is_estimated' => 'boolean',
            'ps_pretax_medical' => 'decimal:4',
            'ps_pretax_fsa' => 'decimal:4',
            'ps_salary' => 'decimal:4',
            'ps_vacation_payout' => 'decimal:4',
            'ps_pretax_dental' => 'decimal:4',
            'ps_pretax_vision' => 'decimal:4',
        ];
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
