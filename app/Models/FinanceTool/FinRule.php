<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FinRule extends Model
{
    use SoftDeletes;

    protected $table = 'fin_rules';

    protected $fillable = [
        'user_id',
        'order',
        'title',
        'is_disabled',
        'stop_processing_if_match',
    ];

    protected $casts = [
        'is_disabled' => 'boolean',
        'stop_processing_if_match' => 'boolean',
        'order' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function conditions()
    {
        return $this->hasMany(FinRuleCondition::class, 'rule_id');
    }

    public function actions()
    {
        return $this->hasMany(FinRuleAction::class, 'rule_id')->orderBy('order');
    }

    public function logs()
    {
        return $this->hasMany(FinRuleLog::class, 'rule_id');
    }
}
