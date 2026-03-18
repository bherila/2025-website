<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class FinRuleLog extends Model
{
    protected $table = 'fin_rule_logs';

    protected $fillable = [
        'user_id',
        'rule_id',
        'transaction_id',
        'is_manual_run',
        'action_summary',
        'error',
        'error_details',
        'processing_time_mtime',
    ];

    protected $casts = [
        'is_manual_run' => 'boolean',
        'processing_time_mtime' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function rule()
    {
        return $this->belongsTo(FinRule::class, 'rule_id');
    }

    public function transaction()
    {
        return $this->belongsTo(FinAccountLineItems::class, 'transaction_id', 't_id');
    }
}
