<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinRuleCondition extends Model
{
    protected $table = 'fin_rule_conditions';

    protected $fillable = [
        'rule_id',
        'type',
        'operator',
        'value',
        'value_extra',
    ];

    public function rule()
    {
        return $this->belongsTo(FinRule::class, 'rule_id');
    }
}
