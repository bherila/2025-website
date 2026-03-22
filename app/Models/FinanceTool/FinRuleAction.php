<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinRuleAction extends Model
{
    protected $table = 'fin_rule_actions';

    protected $fillable = [
        'rule_id',
        'type',
        'target',
        'payload',
        'order',
    ];

    protected $casts = [
        'order' => 'integer',
    ];

    public function rule()
    {
        return $this->belongsTo(FinRule::class, 'rule_id');
    }
}
